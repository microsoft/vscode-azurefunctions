/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
// tslint:disable-next-line:no-require-imports
import opn = require("opn");
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as appservice from 'vscode-azureappservice';
import { AzureTreeItem, DialogResponses, IActionContext, IAzureUserInput, TelemetryProperties, UserCancelledError } from 'vscode-azureextensionui';
import { cSharpPublishTaskLabel, deploySubpathSetting, extensionPrefix, extInstallTaskName, javaPackageTaskLabel, packTaskName, preDeployTaskSetting, ProjectLanguage, ProjectRuntime, ScmType } from '../constants';
import { ext } from '../extensionVariables';
import { addLocalFuncTelemetry } from '../funcCoreTools/getLocalFuncCoreToolsVersion';
import { HttpAuthLevel } from '../FunctionConfig';
import { localize } from '../localize';
import { convertStringToRuntime, getFuncExtensionSetting, getProjectLanguage, getProjectRuntime, updateGlobalSetting, updateWorkspaceSetting } from '../ProjectSettings';
import { FunctionsTreeItem } from '../tree/FunctionsTreeItem';
import { FunctionTreeItem } from '../tree/FunctionTreeItem';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../tree/SlotTreeItemBase';
import { isPathEqual, isSubpath } from '../utils/fs';
import { getCliFeedAppSettings } from '../utils/getCliFeedJson';
import * as workspaceUtil from '../utils/workspace';
import { startStreamingLogs } from './logstream/startStreamingLogs';

// tslint:disable-next-line:max-func-body-length
export async function deploy(this: IActionContext, target?: vscode.Uri | string | SlotTreeItemBase, functionAppId?: string | {}): Promise<void> {
    addLocalFuncTelemetry(this);

    const telemetryProperties: TelemetryProperties = this.properties;
    let deployFsPath: string;
    const newNodes: SlotTreeItemBase[] = [];
    let node: SlotTreeItemBase | undefined;

    if (target instanceof vscode.Uri) {
        deployFsPath = await appendDeploySubpathSetting(target.fsPath);
    } else if (typeof target === 'string') {
        deployFsPath = await appendDeploySubpathSetting(target);
    } else {
        deployFsPath = await getDeployFsPath();
        node = target;
    }

    const folderOpenWarning: string = localize('folderOpenWarning', 'Failed to deploy because the folder is not open in a workspace. Open in a workspace and try again.');
    const workspaceFsPath: string = await workspaceUtil.ensureFolderIsOpen(deployFsPath, this, folderOpenWarning, true /* allowSubFolder */);

    if (!node) {
        if (!functionAppId || typeof functionAppId !== 'string') {
            const onNodeCreatedFromQuickPickDisposable: vscode.Disposable = ext.tree.onTreeItemCreate((newNode: SlotTreeItemBase) => {
                // event is fired from azure-extensionui if node was created during deployment
                newNodes.push(newNode);
            });
            try {
                node = <SlotTreeItemBase>await ext.tree.showTreeItemPicker(ProductionSlotTreeItem.contextValue);
            } finally {
                onNodeCreatedFromQuickPickDisposable.dispose();
            }
        } else {
            const functionAppNode: AzureTreeItem | undefined = await ext.tree.findTreeItem(functionAppId);
            if (functionAppNode) {
                node = <SlotTreeItemBase>functionAppNode;
            } else {
                throw new Error(localize('noMatchingFunctionApp', 'Failed to find a function app matching id "{0}".', functionAppId));
            }
        }
    }

    // if the node selected for deployment is the same newly created nodes, stifle the confirmDeployment dialog
    const confirmDeployment: boolean = !newNodes.some((newNode: AzureTreeItem) => !!node && newNode.fullId === node.fullId);

    const client: appservice.SiteClient = node.root.client;
    const language: ProjectLanguage = await getProjectLanguage(deployFsPath, ext.ui);
    telemetryProperties.projectLanguage = language;
    const runtime: ProjectRuntime = await getProjectRuntime(language, deployFsPath, ext.ui);
    telemetryProperties.projectRuntime = runtime;

    if (language === ProjectLanguage.Python && !node.root.client.isLinux) {
        throw new Error(localize('pythonNotAvailableOnWindows', 'Python projects are not supported on Windows function apps.  Deploy to a Linux function app instead.'));
    }
    await verifyWebContentSettings(node, telemetryProperties);

    await verifyRuntimeIsCompatible(runtime, ext.ui, ext.outputChannel, client, telemetryProperties);

    const siteConfig: WebSiteManagementModels.SiteConfigResource = await client.getSiteConfig();
    const isZipDeploy: boolean = siteConfig.scmType !== ScmType.LocalGit && siteConfig !== ScmType.GitHub;
    if (confirmDeployment && isZipDeploy) {
        const warning: string = localize('confirmDeploy', 'Are you sure you want to deploy to "{0}"? This will overwrite any previous deployment and cannot be undone.', client.fullName);
        telemetryProperties.cancelStep = 'confirmDestructiveDeployment';
        const deployButton: vscode.MessageItem = { title: localize('deploy', 'Deploy') };
        await ext.ui.showWarningMessage(warning, { modal: true }, deployButton, DialogResponses.cancel);
        telemetryProperties.cancelStep = '';
    }

    const preDeployResult: appservice.IPreDeployTaskResult = await appservice.tryRunPreDeployTask(this, deployFsPath, siteConfig.scmType, extensionPrefix);
    await handlePreDeployTaskResult(this, deployFsPath, siteConfig.scmType, preDeployResult, language, runtime);

    if (siteConfig.scmType === ScmType.LocalGit) {
        // preDeploy tasks are not required for LocalGit so subpath may not exist
        deployFsPath = workspaceFsPath;
    }

    if (isZipDeploy) {
        // tslint:disable-next-line:no-floating-promises
        validateGlobSettings(this, deployFsPath);
    }

    await node.runWithTemporaryDescription(
        localize('deploying', 'Deploying...'),
        async () => {
            try {
                // Stop function app here to avoid *.jar file in use on server side.
                // More details can be found: https://github.com/Microsoft/vscode-azurefunctions/issues/106
                if (language === ProjectLanguage.Java) {
                    ext.outputChannel.appendLine(localize('stopFunctionApp', 'Stopping Function App: {0} ...', client.fullName));
                    await client.stop();
                }
                await appservice.deploy(client, deployFsPath, this);
            } finally {
                if (language === ProjectLanguage.Java) {
                    ext.outputChannel.appendLine(localize('startFunctionApp', 'Starting Function App: {0} ...', client.fullName));
                    await client.start();
                }
            }
        }
    );

    const deployComplete: string = localize('deployComplete', 'Deployment to "{0}" completed.', client.fullName);
    ext.outputChannel.appendLine(deployComplete);
    const viewOutput: vscode.MessageItem = { title: localize('viewOutput', 'View Output') };
    const streamLogs: vscode.MessageItem = { title: localize('streamLogs', 'Stream Logs') };

    // Don't wait
    vscode.window.showInformationMessage(deployComplete, streamLogs, viewOutput).then(async (result: vscode.MessageItem | undefined) => {
        if (result === viewOutput) {
            ext.outputChannel.show();
        } else if (result === streamLogs) {
            await startStreamingLogs(node);
        }
    });

    await listHttpTriggerUrls(node, this);
}

async function validateGlobSettings(actionContext: IActionContext, fsPath: string): Promise<void> {
    const includeKey: string = 'zipGlobPattern';
    const excludeKey: string = 'zipIgnorePattern';
    const includeSetting: string | undefined = getFuncExtensionSetting(includeKey, fsPath);
    const excludeSetting: string | string[] | undefined = getFuncExtensionSetting(excludeKey, fsPath);
    if (includeSetting || excludeSetting) {
        actionContext.properties.hasOldGlobSettings = 'true';
        const message: string = localize('globSettingRemoved', '"{0}" and "{1}" settings are no longer supported. Instead, place a ".funcignore" file at the root of your repo, using the same syntax as a ".gitignore" file.', includeKey, excludeKey);
        await ext.ui.showWarningMessage(message);
    }
}

async function listHttpTriggerUrls(node: SlotTreeItemBase, actionContext: IActionContext): Promise<void> {
    try {
        const children: AzureTreeItem[] = await node.getCachedChildren();
        const functionsNode: FunctionsTreeItem = <FunctionsTreeItem>children.find((n: AzureTreeItem) => n instanceof FunctionsTreeItem);
        await node.treeDataProvider.refresh(functionsNode);
        const functions: AzureTreeItem[] = await functionsNode.getCachedChildren();
        const anonFunctions: FunctionTreeItem[] = <FunctionTreeItem[]>functions.filter((f: AzureTreeItem) => f instanceof FunctionTreeItem && f.config.isHttpTrigger && f.config.authLevel === HttpAuthLevel.anonymous);
        if (anonFunctions.length > 0) {
            ext.outputChannel.appendLine(localize('anonymousFunctionUrls', 'HTTP Trigger Urls:'));
            for (const func of anonFunctions) {
                ext.outputChannel.appendLine(`  ${func.label}: ${func.triggerUrl}`);
            }
        }

        if (functions.find((f: AzureTreeItem) => f instanceof FunctionTreeItem && f.config.isHttpTrigger && f.config.authLevel !== HttpAuthLevel.anonymous)) {
            ext.outputChannel.appendLine(localize('nonAnonymousWarning', 'WARNING: Some http trigger urls cannot be displayed in the output window because they require an authentication token. Instead, you may copy them from the Azure Functions explorer.'));
        }
    } catch (error) {
        // suppress error notification and instead display a warning in the output. We don't want it to seem like the deployment failed.
        actionContext.suppressErrorDisplay = true;
        ext.outputChannel.appendLine(localize('failedToList', 'WARNING: Deployment succeeded, but failed to list http trigger urls.'));
        throw error;
    }
}

/**
 * If there is only one workspace and it has 'deploySubPath' set - return that value. Otherwise, prompt the user
 */
async function getDeployFsPath(): Promise<string> {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1) {
        const folderPath: string = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const deploySubpath: string | undefined = getFuncExtensionSetting(deploySubpathSetting, folderPath);
        if (deploySubpath) {
            return path.join(folderPath, deploySubpath);
        }
    }

    const workspaceMessage: string = localize('azFunc.selectZipDeployFolder', 'Select the folder to zip and deploy');
    return await workspaceUtil.selectWorkspaceFolder(ext.ui, workspaceMessage, (f: vscode.WorkspaceFolder) => getFuncExtensionSetting(deploySubpathSetting, f.uri.fsPath));
}

/**
 * Appends the deploySubpath setting if the target path matches the root of a workspace folder
 * If the targetPath is a sub folder instead of the root, leave the targetPath as-is and assume they want that exact folder used
 */
async function appendDeploySubpathSetting(targetPath: string): Promise<string> {
    if (vscode.workspace.workspaceFolders) {
        const deploySubPath: string | undefined = getFuncExtensionSetting(deploySubpathSetting, targetPath);
        if (deploySubPath) {
            if (vscode.workspace.workspaceFolders.some((f: vscode.WorkspaceFolder) => isPathEqual(f.uri.fsPath, targetPath))) {
                return path.join(targetPath, deploySubPath);
            } else {
                const folder: vscode.WorkspaceFolder | undefined = vscode.workspace.workspaceFolders.find((f: vscode.WorkspaceFolder) => isSubpath(f.uri.fsPath, targetPath));
                if (folder) {
                    const fsPathWithSetting: string = path.join(folder.uri.fsPath, deploySubPath);
                    if (!isPathEqual(fsPathWithSetting, targetPath)) {
                        const settingKey: string = 'showDeploySubpathWarning';
                        if (getFuncExtensionSetting(settingKey)) {
                            const selectedFolder: string = path.relative(folder.uri.fsPath, targetPath);
                            const message: string = localize('mismatchDeployPath', 'Deploying "{0}" instead of selected folder "{1}". Use "{2}.{3}" to change this behavior.', deploySubPath, selectedFolder, extensionPrefix, deploySubpathSetting);
                            // don't wait
                            // tslint:disable-next-line:no-floating-promises
                            ext.ui.showWarningMessage(message, { title: localize('ok', 'OK') }, DialogResponses.dontWarnAgain).then(async (result: vscode.MessageItem) => {
                                if (result === DialogResponses.dontWarnAgain) {
                                    await updateGlobalSetting(settingKey, false);
                                }
                            });
                        }
                    }

                    return fsPathWithSetting;
                }
            }
        }
    }

    return targetPath;
}

/**
 * NOTE: If we can't recognize the Azure runtime (aka it's undefined), just assume it's compatible
 */
async function verifyRuntimeIsCompatible(localRuntime: ProjectRuntime, ui: IAzureUserInput, outputChannel: vscode.OutputChannel, client: appservice.SiteClient, telemetryProperties: TelemetryProperties): Promise<void> {
    const appSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();
    if (appSettings.properties) {
        const rawAzureRuntime: string = appSettings.properties.FUNCTIONS_EXTENSION_VERSION;
        const azureRuntime: ProjectRuntime | undefined = convertStringToRuntime(rawAzureRuntime);
        if (azureRuntime !== undefined && azureRuntime !== localRuntime) {
            const message: string = localize('incompatibleRuntime', 'The remote runtime "{0}" is not compatible with your local runtime "{1}".', rawAzureRuntime, localRuntime);
            const updateRemoteRuntime: vscode.MessageItem = { title: localize('updateRemoteRuntime', 'Update remote runtime') };
            const result: vscode.MessageItem = await ui.showWarningMessage(message, { modal: true }, updateRemoteRuntime, DialogResponses.learnMore, DialogResponses.cancel);
            if (result === DialogResponses.learnMore) {
                await opn('https://aka.ms/azFuncRuntime');
                telemetryProperties.cancelStep = 'learnMoreRuntime';
                throw new UserCancelledError();
            } else {
                const newAppSettings: { [key: string]: string } = await getCliFeedAppSettings(localRuntime);
                for (const key of Object.keys(newAppSettings)) {
                    const value: string = newAppSettings[key];
                    outputChannel.appendLine(localize('updateFunctionRuntime', 'Updating "{0}" to "{1}"...', key, value));
                    appSettings.properties[key] = value;
                }
                await client.updateApplicationSettings(appSettings);
            }
        }
    }
}

async function handlePreDeployTaskResult(actionContext: IActionContext, deployFsPath: string, scmType: string | undefined, result: appservice.IPreDeployTaskResult, language: ProjectLanguage, runtime: ProjectRuntime): Promise<void> {
    // https://github.com/Microsoft/vscode-azurefunctions/issues/826
    if (result.taskName === packTaskName && result.exitCode === 4) {
        result = await promptToBuildNativeDeps(actionContext, deployFsPath, scmType);
    }

    const messageLines: string[] = [];
    if (!result.taskName) {
        const recommendedTaskName: string | undefined = getRecommendedTaskName(language, runtime);
        if (recommendedTaskName) {
            messageLines.push(localize('noPreDeployTaskWarning', 'WARNING: Did not find recommended preDeploy task "{0}". The deployment will continue, but the selected folder may not reflect your latest changes.', recommendedTaskName));
            messageLines.push(localize('howToAddPreDeploy', 'In order to ensure that you always deploy your latest changes, add a preDeploy task with the following steps:'));
            const fullMessage: string = getFullPreDeployMessage(messageLines);
            ext.outputChannel.show(true);
            ext.outputChannel.appendLine(fullMessage);
        }
    } else if (result.failedToFindTask) {
        messageLines.push(localize('noPreDeployTaskError', 'Did not find preDeploy task "{0}". Change the "{1}.{2}" setting, manually edit your task.json, or re-initialize your VS Code config with the following steps:', result.taskName, extensionPrefix, preDeployTaskSetting));
        const fullMessage: string = getFullPreDeployMessage(messageLines);
        throw new Error(fullMessage);
    } else if (result.exitCode !== undefined && result.exitCode !== 0) {
        await appservice.handleFailedPreDeployTask(actionContext, result);
    }
}

function getFullPreDeployMessage(messageLines: string[]): string {
    messageLines.push(localize('howToAddPreDeploy1', '1. Open Command Palette (View -> Command Palette...)'));
    messageLines.push(localize('howToAddPreDeploy2', '2. Search for "Azure Functions" and run command "Initialize Project for Use with VS Code"'));
    messageLines.push(localize('howToAddPreDeploy3', '3. Select "Yes" to overwrite your tasks.json file when prompted'));
    return messageLines.join(os.EOL);
}

function getRecommendedTaskName(language: ProjectLanguage, runtime: ProjectRuntime): string | undefined {
    switch (language) {
        case ProjectLanguage.CSharp:
            return cSharpPublishTaskLabel;
        case ProjectLanguage.JavaScript:
            // "func extensions install" is only supported on v2
            return runtime === ProjectRuntime.v1 ? undefined : extInstallTaskName;
        case ProjectLanguage.Python:
            return packTaskName;
        case ProjectLanguage.Java:
            return javaPackageTaskLabel;
        default:
            return undefined; // preDeployTask not needed
    }
}

async function promptToBuildNativeDeps(actionContext: IActionContext, deployFsPath: string, scmType: string | undefined): Promise<appservice.IPreDeployTaskResult> {
    const message: string = localize('funcPackFailed', 'Failed to package your project. Use a Docker container to build incompatible dependencies?');
    const result: vscode.MessageItem | undefined = await vscode.window.showErrorMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.learnMore);
    if (result === DialogResponses.yes) {
        actionContext.properties.preDeployTaskResponse = 'packNativeDeps';
        const flag: string = '--build-native-deps';
        await updateWorkspaceSetting(preDeployTaskSetting, `${packTaskName} ${flag}`, deployFsPath);
        return await appservice.tryRunPreDeployTask(actionContext, deployFsPath, scmType, extensionPrefix);
    } else if (result === DialogResponses.learnMore) {
        actionContext.properties.preDeployTaskResponse = 'packLearnMore';
        // tslint:disable-next-line:no-floating-promises
        opn('https://aka.ms/func-python-publish');
        throw new UserCancelledError();
    } else {
        actionContext.properties.preDeployTaskResponse = 'cancel';
        throw new UserCancelledError();
    }
}

/**
 * We need this check due to this issue: https://github.com/Microsoft/vscode-azurefunctions/issues/625
 * Only applies to Linux Consumption apps
 */
async function verifyWebContentSettings(node: SlotTreeItemBase, telemetryProperties: TelemetryProperties): Promise<void> {
    if (node.root.client.isLinux) {
        const asp: WebSiteManagementModels.AppServicePlan | undefined = await node.root.client.getAppServicePlan();
        if (!!asp && !!asp.sku && !!asp.sku.tier && asp.sku.tier.toLowerCase() === 'dynamic') {
            const client: appservice.SiteClient = node.root.client;
            const applicationSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();
            const WEBSITE_CONTENTAZUREFILECONNECTIONSTRING: string = 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING';
            const WEBSITE_CONTENTSHARE: string = 'WEBSITE_CONTENTSHARE';
            if (applicationSettings.properties && (applicationSettings.properties[WEBSITE_CONTENTAZUREFILECONNECTIONSTRING] || applicationSettings.properties[WEBSITE_CONTENTSHARE])) {
                telemetryProperties.webContentSettingsRemoved = 'false';
                await ext.ui.showWarningMessage(
                    localize('notConfiguredForDeploy', 'The selected app is not configured for deployment through VS Code. Remove app settings "{0}" and "{1}"?', WEBSITE_CONTENTAZUREFILECONNECTIONSTRING, WEBSITE_CONTENTSHARE),
                    { modal: true },
                    DialogResponses.yes,
                    DialogResponses.cancel
                );
                delete applicationSettings.properties[WEBSITE_CONTENTAZUREFILECONNECTIONSTRING];
                delete applicationSettings.properties[WEBSITE_CONTENTSHARE];
                telemetryProperties.webContentSettingsRemoved = 'true';
                await client.updateApplicationSettings(applicationSettings);
                // if the user cancels the deployment, the app settings node doesn't reflect the deleted settings
                await node.appSettingsTreeItem.refresh();
            }
        }
    }
}
