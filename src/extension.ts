/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { WebSiteManagementMappers } from '@azure/arm-appservice';
import { HttpOperationResponse } from '@azure/ms-rest-js';
import * as extract from 'extract-zip';
import { URL } from 'url';
import * as vscode from 'vscode';
import { registerAppServiceExtensionVariables } from 'vscode-azureappservice';
import { AzExtTreeDataProvider, AzureUserInput, callWithTelemetryAndErrorHandling, createApiProvider, createAzExtOutputChannel, IActionContext, registerErrorHandler, registerEvent, registerReportIssueCommand, registerUIExtensionVariables } from 'vscode-azureextensionui';
// tslint:disable-next-line:no-submodule-imports
import { AzureExtensionApiProvider } from 'vscode-azureextensionui/api';
import { createFunctionFromApi } from './commands/api/createFunctionFromApi';
import { downloadAppSettingsFromApi } from './commands/api/downloadAppSettingsFromApi';
import { revealTreeItem } from './commands/api/revealTreeItem';
import { uploadAppSettingsFromApi } from './commands/api/uploadAppSettingsFromApi';
import { runPostFunctionCreateStepsFromCache } from './commands/createFunction/FunctionCreateStepBase';
import { initProjectForVSCode } from './commands/initProjectForVSCode/initProjectForVSCode';
import { registerCommands } from './commands/registerCommands';
import { func, ProjectLanguage } from './constants';
import { AzureAccount } from './debug/AzureAccountExtension.api';
import { FuncTaskProvider } from './debug/FuncTaskProvider';
import { JavaDebugProvider } from './debug/JavaDebugProvider';
import { NodeDebugProvider } from './debug/NodeDebugProvider';
import { PowerShellDebugProvider } from './debug/PowerShellDebugProvider';
import { PythonDebugProvider } from './debug/PythonDebugProvider';
import { ext } from './extensionVariables';
import { registerFuncHostTaskEvents } from './funcCoreTools/funcHostTask';
import { validateFuncCoreToolsIsLatest } from './funcCoreTools/validateFuncCoreToolsIsLatest';
import { localize } from './localize';
import { CentralTemplateProvider } from './templates/CentralTemplateProvider';
import { AzureAccountTreeItemWithProjects } from './tree/AzureAccountTreeItemWithProjects';
import { getNameFromId } from './utils/azure';
import { requestUtils } from './utils/requestUtils';
import { AzureFunctionsExtensionApi } from './vscode-azurefunctions.api';
import { verifyVSCodeConfigOnActivate } from './vsCodeConfig/verifyVSCodeConfigOnActivate';

enum GlobalStates {
    initProjectWithoutConfigVerification = 'initProjectWithoutConfigVerification',
    projectFilePath = 'projectFilePath',
    projectLanguage = 'projectLanguage'
}

interface ILocalDevelopmentRequiredInputs {
    resourceId: string | null;
    defaultHostName: string | null;
    devContainerName: string | null;
    language: string | null;
    downloadAppContent: string | null;
}

export async function activateInternal(context: vscode.ExtensionContext, perfStats: { loadStartTime: number; loadEndTime: number }, ignoreBundle?: boolean): Promise<AzureExtensionApiProvider> {
    ext.context = context;
    ext.ignoreBundle = ignoreBundle;
    ext.outputChannel = createAzExtOutputChannel('Azure Functions', ext.prefix);
    context.subscriptions.push(ext.outputChannel);
    ext.ui = new AzureUserInput(context.globalState);

    const azureAccountExt: vscode.Extension<AzureAccount> | undefined = vscode.extensions.getExtension<AzureAccount>('ms-vscode.azure-account');

    registerUIExtensionVariables(ext);
    registerAppServiceExtensionVariables(ext);
    // NOTE: Example call for opening vscode with query parameters -
    // vscode://ms-azuretools.vscode-azurefunctions/?resourceId=<appResourceId>&defaultHostName=<appHostName>&devcontainer=<devContainerName>&language=<appLanguage>&downloadAppContent=<true/false>
    vscode.window.registerUriHandler({
        async handleUri(uri: vscode.Uri): Promise<void> {
            return handleUriForLocalDevelopment(uri, azureAccountExt);
        }
    });

    await callWithTelemetryAndErrorHandling('azureFunctions.activate', async (activateContext: IActionContext) => {
        activateContext.telemetry.properties.isActivationEvent = 'true';
        activateContext.telemetry.measurements.mainFileLoad = (perfStats.loadEndTime - perfStats.loadStartTime) / 1000;

        runPostFunctionCreateStepsFromCache();

        // tslint:disable-next-line:no-floating-promises
        validateFuncCoreToolsIsLatest();

        ext.azureAccountTreeItem = new AzureAccountTreeItemWithProjects();
        context.subscriptions.push(ext.azureAccountTreeItem);
        ext.tree = new AzExtTreeDataProvider(ext.azureAccountTreeItem, 'azureFunctions.loadMore');
        ext.treeView = vscode.window.createTreeView('azFuncTree', { treeDataProvider: ext.tree, showCollapseAll: true });
        context.subscriptions.push(ext.treeView);

        const validateEventId: string = 'azureFunctions.validateFunctionProjects';
        // tslint:disable-next-line:no-floating-promises
        callWithTelemetryAndErrorHandling(validateEventId, async (actionContext: IActionContext) => {
            if (ext.context.globalState.get(GlobalStates.initProjectWithoutConfigVerification) === true) {
                vscode.window.showInformationMessage(localize('initializingFunctionAppProjectInfoMessage', 'Initializing function app project with language specific metadata'));
                ext.context.globalState.update(GlobalStates.initProjectWithoutConfigVerification, false);
                await initProjectForVSCode(actionContext, ext.context.globalState.get(GlobalStates.projectFilePath), ext.context.globalState.get(GlobalStates.projectLanguage));
            } else {
                await verifyVSCodeConfigOnActivate(actionContext, vscode.workspace.workspaceFolders);
            }
        });
        registerEvent(validateEventId, vscode.workspace.onDidChangeWorkspaceFolders, async (actionContext: IActionContext, event: vscode.WorkspaceFoldersChangeEvent) => {
            await verifyVSCodeConfigOnActivate(actionContext, event.added);
        });

        ext.templateProvider = new CentralTemplateProvider();

        // Suppress "Report an Issue" button for all errors in favor of the command
        registerErrorHandler(c => c.errorHandling.suppressReportIssue = true);
        registerReportIssueCommand('azureFunctions.reportIssue');

        registerCommands();

        registerFuncHostTaskEvents();

        const nodeDebugProvider: NodeDebugProvider = new NodeDebugProvider();
        const pythonDebugProvider: PythonDebugProvider = new PythonDebugProvider();
        const javaDebugProvider: JavaDebugProvider = new JavaDebugProvider();
        const powershellDebugProvider: PowerShellDebugProvider = new PowerShellDebugProvider();

        // These don't actually overwrite "node", "python", etc. - they just add to it
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('node', nodeDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('python', pythonDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java', javaDebugProvider));
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('PowerShell', powershellDebugProvider));
        context.subscriptions.push(vscode.workspace.registerTaskProvider(func, new FuncTaskProvider(nodeDebugProvider, pythonDebugProvider, javaDebugProvider, powershellDebugProvider)));

        // Temporary workaround so that "powerShellVersion" is an allowed property on SiteConfig
        // https://github.com/Azure/azure-sdk-for-js/issues/10552
        // tslint:disable-next-line: no-non-null-assertion
        WebSiteManagementMappers.SiteConfig.type.modelProperties!.powerShellVersion = { serializedName: 'powerShellVersion', type: { name: 'String' } };
        // tslint:disable-next-line: no-non-null-assertion
        WebSiteManagementMappers.SiteConfigResource.type.modelProperties!.powerShellVersion = { serializedName: 'properties.powerShellVersion', type: { name: 'String' } };
    });

    return createApiProvider([<AzureFunctionsExtensionApi>{
        revealTreeItem,
        createFunction: createFunctionFromApi,
        downloadAppSettings: downloadAppSettingsFromApi,
        uploadAppSettings: uploadAppSettingsFromApi,
        apiVersion: '1.3.0'
    }]);
}

// tslint:disable-next-line:no-empty
export function deactivateInternal(): void {
}

async function handleUriForLocalDevelopment(uri: vscode.Uri, azureAccountExt: vscode.Extension<AzureAccount> | undefined): Promise<void> {
    ext.context.globalState.update(GlobalStates.initProjectWithoutConfigVerification, true);
    const account: AzureAccount | undefined = await activateAzureExtension(azureAccountExt);
    if (account) {
        // tslint:disable-next-line:typedef
        const token = await setupAzureAccount(account);
        if (token) {
            const filePath: string | undefined = await vscode.window.showInputBox({ prompt: localize('absoluteFolderPathInputPromptText', 'Enter absolute folder path for your local project'), ignoreFocusOut: true });
            if (filePath) {
                // tslint:disable-next-line: no-unsafe-any
                return setupLocalProjectFolder(uri, filePath, token.accessToken, account);
            } else {
                vscode.window.showErrorMessage(localize('filepathUndefinedErrorMessage', 'Folder path not entered. Please try again.'));
            }
        }
    }
}

async function setupLocalProjectFolder(uri: vscode.Uri, filePath: string, token: string, account: AzureAccount): Promise<void> {
    const requiredInputs: ILocalDevelopmentRequiredInputs = getAllRequiredInputs(uri.query);
    const resourceId: string | null = requiredInputs.resourceId;
    const defaultHostName: string | null = requiredInputs.defaultHostName;
    const devContainerName: string | null = requiredInputs.devContainerName;
    const language: string | null = requiredInputs.language;
    const downloadAppContent: string | null = requiredInputs.downloadAppContent;

    if (resourceId && defaultHostName && devContainerName && language && downloadAppContent) {
        ext.context.globalState.update(GlobalStates.projectLanguage, getProjectLanguageForLanguage(language));
        const vsCodeFilePathUri: vscode.Uri = vscode.Uri.file(filePath);
        const toBeDeletedFolderPathUri: vscode.Uri = vscode.Uri.joinPath(vsCodeFilePathUri, 'temp');

        try {
            const functionAppName: string = getNameFromId(resourceId, false);
            const downloadFilePath: string = vscode.Uri.joinPath(toBeDeletedFolderPathUri, `${functionAppName}.zip`).fsPath;

            vscode.window.showInformationMessage(localize('settingUpFunctionAppLocalProjInfoMessage', `Setting up project for function app '${functionAppName}' with language '${language}'.`));

            if (downloadAppContent === 'true') {
                // NOTE: We don't want to download app content for compiled languages.
                await callWithTelemetryAndErrorHandling('azureFunctions.getFunctionAppMasterKeyAndDownloadContent', async (_actionContext: IActionContext) => {
                    const listKeyResponse: HttpOperationResponse = await requestUtils.getFunctionAppMasterKey(account.sessions[0], resourceId, token);
                    // tslint:disable-next-line: no-unsafe-any
                    await requestUtils.downloadFunctionAppContent(defaultHostName, downloadFilePath, listKeyResponse.parsedBody.masterKey);
                });
            }

            const projectFilePathUri: vscode.Uri = vscode.Uri.joinPath(vsCodeFilePathUri, `${functionAppName}`);
            const projectFilePath: string = projectFilePathUri.fsPath;
            const devContainerFolderPathUri: vscode.Uri = vscode.Uri.joinPath(projectFilePathUri, '.devcontainer');
            ext.context.globalState.update(GlobalStates.projectFilePath, projectFilePathUri.fsPath);
            await callWithTelemetryAndErrorHandling('azureFunctions.extractContentAndDownloadDevContainerFiles', async (_actionContext: IActionContext) => {
                if (downloadAppContent === 'true') {
                    // tslint:disable-next-line: no-unsafe-any
                    await extract(downloadFilePath, { dir: projectFilePath });
                }
                await requestUtils.downloadFile(
                    `https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/devcontainer.json`,
                    vscode.Uri.joinPath(devContainerFolderPathUri, 'devcontainer.json').fsPath
                );
                await requestUtils.downloadFile(
                    `https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/Dockerfile`,
                    vscode.Uri.joinPath(devContainerFolderPathUri, 'Dockerfile').fsPath
                );
            });
            vscode.window.showInformationMessage(localize('restartingVsCodeInfoMessage', 'Restarting VS Code with your function app project'));
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectFilePath));
        } catch (err) {
            vscode.window.showErrorMessage(localize('failedLocalProjSetupErrorMessage', 'Failed to set up your local project. Please try again.'));
        } finally {
            vscode.workspace.fs.delete(
                vscode.Uri.file(toBeDeletedFolderPathUri.fsPath),
                {
                    recursive: true,
                    useTrash: true
                }
            );
        }
    } else {
        vscode.window.showErrorMessage(localize('invalidInputsErrorMessage', 'Invalid inputs. Please try again.'));
    }
}

function getProjectLanguageForLanguage(language: string): ProjectLanguage {
    switch (language) {
        case 'powershell':
            return ProjectLanguage.PowerShell;
        case 'node':
            return ProjectLanguage.TypeScript;
        case 'python':
            return ProjectLanguage.Python;
        case 'java8':
        case 'java11':
            return ProjectLanguage.Java;
        case 'dotnetcore2.1':
        case 'dotnetcore3.1':
            return ProjectLanguage.CSharp;
        default:
            vscode.window.showErrorMessage(localize('unsupportedLangErrorMessage', 'Language not supported: "{0}"', language));
            throw new Error(`Language not supported: ${language}`);
    }
}

// tslint:disable-next-line:no-any
async function setupAzureAccount(account: AzureAccount): Promise<any> {
    try {
        await vscode.commands.executeCommand('azure-account.login');
        return await account.sessions[0].credentials2.getToken();
    } catch (err) {
        vscode.window.showErrorMessage(localize('failedAzureAccSetupErrorMessage', 'Failed to setup Azure account. Please try again.'));
        return Promise.resolve(undefined);
    }
}

async function activateAzureExtension(azureAccountExt: vscode.Extension<AzureAccount> | undefined): Promise<AzureAccount | undefined> {
    return await azureAccountExt?.activate();
}

function getAllRequiredInputs(query: string): ILocalDevelopmentRequiredInputs {
    // NOTE: Need to generate the URL on line 234 so we can use the parser below to get query values.
    const queryUrl: URL = new URL(`https://functions.azure.com?${query.toLowerCase()}`);

    return {
        resourceId: queryUrl.searchParams.get('resourceid'),
        defaultHostName: queryUrl.searchParams.get('defaulthostname'),
        devContainerName: queryUrl.searchParams.get('devcontainer'),
        language: queryUrl.searchParams.get('language'),
        downloadAppContent: queryUrl.searchParams.get('downloadappcontent'),
    };
}
