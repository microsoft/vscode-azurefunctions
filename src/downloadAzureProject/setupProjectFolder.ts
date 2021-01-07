import { WebSiteManagementModels } from '@azure/arm-appservice';
import * as extract from 'extract-zip';
import { URL } from 'url';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../constants';
import { GlobalStates } from '../extension';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getNameFromId } from '../utils/azure';
import { requestUtils } from '../utils/requestUtils';

interface ILocalDevelopmentRequiredInputs {
    resourceId: string | null;
    defaultHostName: string | null;
    devContainerName: string | null;
    language: string | null;
    downloadAppContent: string | null;
}

export async function setupProjectFolder(uri: vscode.Uri, filePath: string): Promise<void> {
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
            const functionAppName: string = getNameFromId(resourceId);
            const downloadFilePath: string = vscode.Uri.joinPath(toBeDeletedFolderPathUri, `${functionAppName}.zip`).fsPath;

            vscode.window.showInformationMessage(localize('settingUpFunctionAppLocalProjInfoMessage', `Setting up project for function app '${functionAppName}' with language '${language}'.`));

            if (downloadAppContent === 'true') {
                // NOTE: We don't want to download app content for compiled languages.
                await callWithTelemetryAndErrorHandling('azureFunctions.getFunctionAppMasterKeyAndDownloadContent', async (actionContext: IActionContext) => {
                    const hostKeys: WebSiteManagementModels.HostKeys | undefined = await requestUtils.getFunctionAppMasterKey(resourceId, actionContext);
                    // tslint:disable-next-line: no-unsafe-any
                    if (!!hostKeys && hostKeys.masterKey) {
                        await requestUtils.downloadFunctionAppContent(defaultHostName, downloadFilePath, hostKeys.masterKey);
                    }
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

function getAllRequiredInputs(query: string): ILocalDevelopmentRequiredInputs {
    // NOTE: VSCode treats resourceId as case sensitive. Hence we need to use split to get resourceId query value.
    const queryParts: string[] = query.split('&');
    const resourceId: string | null = queryParts[0].split('=')[1];

    // NOTE: Need to generate the URL on line 234 so we can use the parser below to get query values. We need to convert to lower case for searchParams to work.
    const queryUrl: URL = new URL(`https://functions.azure.com?${query.toLowerCase()}`);

    return {
        resourceId: resourceId,
        defaultHostName: queryUrl.searchParams.get('defaulthostname'),
        devContainerName: queryUrl.searchParams.get('devcontainer'),
        language: queryUrl.searchParams.get('language'),
        downloadAppContent: queryUrl.searchParams.get('downloadappcontent'),
    };
}
