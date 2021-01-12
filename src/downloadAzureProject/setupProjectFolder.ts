/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { RequestPrepareOptions } from '@azure/ms-rest-js';
import * as extract from 'extract-zip';
import * as querystring from 'querystring';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../constants';
import { GlobalStates } from '../extension';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { SlotTreeItemBase } from "../tree/SlotTreeItemBase";
import { getNameFromId } from '../utils/azure';
import { requestUtils } from '../utils/requestUtils';

export async function setupProjectFolder(uri: vscode.Uri, vsCodeFilePathUri: vscode.Uri): Promise<void> {
    const parsedQuery: querystring.ParsedUrlQuery = querystring.parse(uri.query);
    const resourceId: string = getRequiredQueryParameter(parsedQuery, 'resourceId');
    const devContainerName: string = getRequiredQueryParameter(parsedQuery, 'devcontainer');
    const language: string = getRequiredQueryParameter(parsedQuery, 'language');
    const downloadAppContent: string = getRequiredQueryParameter(parsedQuery, 'downloadAppContent');

    ext.context.globalState.update(GlobalStates.projectLanguage, getProjectLanguageForLanguage(language));
    const toBeDeletedFolderPathUri: vscode.Uri = vscode.Uri.joinPath(vsCodeFilePathUri, 'temp');

    try {
        const functionAppName: string = getNameFromId(resourceId);
        const downloadFilePath: string = vscode.Uri.joinPath(toBeDeletedFolderPathUri, `${functionAppName}.zip`).fsPath;

        vscode.window.showInformationMessage(localize('settingUpFunctionAppLocalProjInfoMessage', `Setting up project for function app '${functionAppName}' with language '${language}'.`));

        if (downloadAppContent === 'true') {
            // NOTE: We don't want to download app content for compiled languages.
            await callWithTelemetryAndErrorHandling('azureFunctions.getFunctionAppMasterKeyAndDownloadContent', async (actionContext: IActionContext) => {
                const slotTreeItem: SlotTreeItemBase | undefined = await ext.tree.findTreeItem(resourceId, { ...actionContext, loadAll: true });
                const hostKeys: WebSiteManagementModels.HostKeys | undefined = await slotTreeItem?.client.listHostKeys();
                const defaultHostName: string | undefined = slotTreeItem?.client.defaultHostName;

                if (!!hostKeys && hostKeys.masterKey && defaultHostName) {
                    const requestOptions: RequestPrepareOptions = {
                        method: 'GET',
                        url: `https://${defaultHostName}/admin/functions/download?includeCsproj=true&includeAppSettings=true`,
                        headers: { 'x-functions-key':  hostKeys.masterKey }
                    };
                    await requestUtils.downloadFile(requestOptions, downloadFilePath);
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

function getRequiredQueryParameter(parsedQuery: querystring.ParsedUrlQuery, key: string): string {
    const value: string | string[] | undefined = parsedQuery[key];
    if (value && typeof value === 'string') {
        return value;
    } else {
        vscode.window.showErrorMessage(localize('invalidInputsErrorMessage', 'Invalid inputs. Please try again.'));
        throw new Error(localize('missingQueryParam', 'Missing query parameter "{0}".', key));
    }
}
