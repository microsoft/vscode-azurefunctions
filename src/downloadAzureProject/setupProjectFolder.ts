/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type HostKeys } from '@azure/arm-appservice';
import { createHttpHeaders } from '@azure/core-rest-pipeline';
import { parseAzureResourceId, type AzExtRequestPrepareOptions } from '@microsoft/vscode-azext-azureutils';
import { AzExtFsExtra, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as extract from 'extract-zip';
import * as querystring from 'querystring';
import * as vscode from 'vscode';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { ProjectLanguage } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { type SlotTreeItem } from "../tree/SlotTreeItem";
import { requestUtils } from '../utils/requestUtils';
import { getRequiredQueryParameter } from './handleUri';

export async function setupProjectFolder(uri: vscode.Uri, vsCodeFilePathUri: vscode.Uri, context: IActionContext): Promise<void> {
    const parsedQuery: querystring.ParsedUrlQuery = querystring.parse(uri.query);
    const resourceId: string = getRequiredQueryParameter(parsedQuery, 'resourceId');
    const devContainerName: string = getRequiredQueryParameter(parsedQuery, 'devcontainer');
    const language: string = getRequiredQueryParameter(parsedQuery, 'language');

    const toBeDeletedFolderPathUri: vscode.Uri = vscode.Uri.joinPath(vsCodeFilePathUri, 'temp');

    try {
        const functionAppName: string = parseAzureResourceId(resourceId).resourceName;
        const downloadFilePath: string = vscode.Uri.joinPath(toBeDeletedFolderPathUri, `${functionAppName}.zip`).fsPath;

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: localize('settingUpFunctionAppLocalProjInfoMessage', `Setting up project for function app '${functionAppName}' with language '${language}'.`) }, async () => {
            // NOTE: We don't want to download app content for compiled languages.
            const slotTreeItem: SlotTreeItem | undefined = await ext.rgApi.tree.findTreeItem(resourceId, { ...context, loadAll: true });
            if (!slotTreeItem) {
                throw new Error(localize('failedToFindApp', 'Failed to find function app with id "{0}"', resourceId));
            }

            await slotTreeItem.initSite(context);
            const site = slotTreeItem.site;
            const client = await site.createClient(context);
            const hostKeys: HostKeys | undefined = await client.listHostKeys();
            const defaultHostName: string | undefined = site.defaultHostName;

            if (!!hostKeys && hostKeys.masterKey && defaultHostName) {
                const requestOptions: AzExtRequestPrepareOptions = {
                    method: 'GET',
                    url: `https://${defaultHostName}/admin/functions/download?includeCsproj=true&includeAppSettings=true`,
                    headers: createHttpHeaders({ 'x-functions-key': hostKeys.masterKey }),
                };
                await requestUtils.downloadFile(context, requestOptions, downloadFilePath);
            } else {
                throw new Error(localize('hostInformationNotFound', 'Failed to get host information for the functionApp.'));
            }

            const projectFilePathUri: vscode.Uri = vscode.Uri.joinPath(vsCodeFilePathUri, `${functionAppName}`);
            const projectFilePath: string = projectFilePathUri.fsPath;
            const devContainerFolderPathUri: vscode.Uri = vscode.Uri.joinPath(projectFilePathUri, '.devcontainer');
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            await extract(downloadFilePath, { dir: projectFilePath });
            await requestUtils.downloadFile(
                context,
                `https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/devcontainer.json`,
                vscode.Uri.joinPath(devContainerFolderPathUri, 'devcontainer.json').fsPath
            );
            await requestUtils.downloadFile(
                context,
                `https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/Dockerfile`,
                vscode.Uri.joinPath(devContainerFolderPathUri, 'Dockerfile').fsPath
            );
            await initProjectForVSCode(context, projectFilePath, getProjectLanguageForLanguage(language));
            await vscode.window.showInformationMessage(localize('restartingVsCodeInfoMessage', 'Restarting VS Code with your function app project'));
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectFilePath), true);
        });
    } catch (err) {
        throw new Error(localize('failedLocalProjSetupErrorMessage', 'Failed to set up your local project: "{0}".', parseError(err).message));
    } finally {
        await AzExtFsExtra.deleteResource(
            toBeDeletedFolderPathUri.fsPath,
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
            return ProjectLanguage.JavaScript;
        case 'python':
            return ProjectLanguage.Python;
        case 'dotnetcore2.1':
        case 'dotnetcore3.1':
            return ProjectLanguage.CSharpScript;
        default:
            throw new Error(`Language not supported: ${language}`);
    }
}
