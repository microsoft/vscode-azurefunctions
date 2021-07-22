/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { RequestPrepareOptions } from '@azure/ms-rest-js';
import * as extract from 'extract-zip';
import * as querystring from 'querystring';
import * as vscode from 'vscode';
import { IActionContext, parseError } from 'vscode-azureextensionui';
import { localDockerPrompt } from '../commands/dockersupport/localDockerSupport';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { ProjectLanguage } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { ProductionSlotTreeItem } from '../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from "../tree/SlotTreeItemBase";
import { getNameFromId } from '../utils/azure';
import { requestUtils } from '../utils/requestUtils';
import { getRequiredQueryParameter } from './handleUri';

export async function setupProjectFolder(uri: vscode.Uri, vsCodeFilePathUri: vscode.Uri, context: IActionContext): Promise<void> {
    const parsedQuery: querystring.ParsedUrlQuery = querystring.parse(uri.query);
    const resourceId: string = getRequiredQueryParameter(parsedQuery, 'resourceId');
    const devContainerName: string = getRequiredQueryParameter(parsedQuery, 'devcontainer');
    const language: string = getRequiredQueryParameter(parsedQuery, 'language');

    const node: SlotTreeItemBase = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context);

    await setupProjectFolderParsed(resourceId, language, vsCodeFilePathUri, context, node, devContainerName);
}

export async function setupProjectFolderParsed(resourceId: string, language: string,
    vsCodeFilePathUri: vscode.Uri, context: IActionContext, node?: SlotTreeItemBase, devContainerName?: string,): Promise<void> {

    if (!devContainerName) {
        devContainerName = getDevContainerName(language);
    }

    const toBeDeletedFolderPathUri: vscode.Uri = vscode.Uri.joinPath(vsCodeFilePathUri, 'temp');

    try {
        const functionAppName: string = getNameFromId(resourceId);
        const downloadFilePath: string = vscode.Uri.joinPath(toBeDeletedFolderPathUri, `${functionAppName}.zip`).fsPath;

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: localize('settingUpFunctionAppLocalProjInfoMessage', `Setting up project for function app '${functionAppName}' with language '${language}'.`) }, async () => {
            const slotTreeItem: SlotTreeItemBase | undefined = await ext.tree.findTreeItem(resourceId, { ...context, loadAll: true });
            const hostKeys: WebSiteManagementModels.HostKeys | undefined = await slotTreeItem?.client.listHostKeys();
            const defaultHostName: string | undefined = slotTreeItem?.client.defaultHostName;

            if (!!hostKeys && hostKeys.masterKey && defaultHostName) {
                const requestOptions: RequestPrepareOptions = {
                    method: 'GET',
                    url: `https://${defaultHostName}/admin/functions/download?includeCsproj=true&includeAppSettings=true`,
                    headers: { 'x-functions-key': hostKeys.masterKey }
                };
                await requestUtils.downloadFile(requestOptions, downloadFilePath);
            } else {
                throw new Error(localize('hostInformationNotFound', 'Failed to get host information for the functionApp.'));
            }

            const projectFilePathUri: vscode.Uri = vscode.Uri.joinPath(vsCodeFilePathUri, `${functionAppName}`);
            const projectFilePath: string = projectFilePathUri.fsPath;
            const devContainerFolderPathUri: vscode.Uri = vscode.Uri.joinPath(projectFilePathUri, '.devcontainer');

            await extract(downloadFilePath, { dir: projectFilePath });
            await localDockerPrompt(context, devContainerFolderPathUri, node, devContainerName);
            await initProjectForVSCode(context, projectFilePath, getProjectLanguageForLanguage(language));

            void vscode.window.showInformationMessage(localize('restartingVsCodeInfoMessage', 'Restarting VS Code with your function app project'));
            const delayMilliseconds = 1500;
            setTimeout(vscode.commands.executeCommand, delayMilliseconds, 'vscode.openFolder', vscode.Uri.file(projectFilePath), true)
        });
    } catch (err) {
        throw new Error(localize('failedLocalProjSetupErrorMessage', 'Failed to set up your local project: "{0}".', parseError(err).message));
    } finally {
        await vscode.workspace.fs.delete(
            vscode.Uri.file(toBeDeletedFolderPathUri.fsPath),
            {
                recursive: true,
                useTrash: true
            }
        );
    }
}

function getProjectLanguageForLanguage(language: string): ProjectLanguage | undefined {
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
            return undefined;
    }
}

function getDevContainerName(language: string): string | undefined {
    switch (language) {
        case 'node':
            return 'azure-functions-node';
        case 'python':
            return 'azure-functions-python-3';
        default:
            return undefined;
    }
}
