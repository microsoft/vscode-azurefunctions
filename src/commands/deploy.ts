/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { SiteWrapper } from 'vscode-azureappservice';
import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import { NoPackagedJavaFunctionError } from '../errors';
import { IUserInterface, Pick } from '../IUserInterface';
import { localize } from '../localize';
import { FunctionAppNode } from '../nodes/FunctionAppNode';
import { getWebSiteClient } from '../nodes/SubscriptionNode';
import { TemplateLanguage } from '../templates/Template';
import { cpUtils } from '../utils/cpUtils';
import { getProjectType } from '../utils/project';
import * as workspaceUtil from '../utils/workspace';
import { VSCodeUI } from '../VSCodeUI';

/* tslint:disable:no-require-imports */
import WebSiteManagementClient = require('azure-arm-website');
import StringDictionary = require('azure-arm-website/lib/models/StringDictionary');

export async function deploy(explorer: AzureFunctionsExplorer, outputChannel: vscode.OutputChannel, context?: FunctionAppNode | vscode.Uri, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    const uri: vscode.Uri | undefined = context && context instanceof vscode.Uri ? context : undefined;
    let node: FunctionAppNode | undefined = context && context instanceof FunctionAppNode ? context : undefined;

    let folderPath: string = uri ? uri.fsPath : await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectZipDeployFolder', 'Select the folder to zip and deploy'));

    if (!node) {
        node = <FunctionAppNode>(await explorer.showNodePicker(FunctionAppNode.contextValue));
    }

    const client: WebSiteManagementClient = getWebSiteClient(node);
    const siteWrapper: SiteWrapper = node.siteWrapper;
    const languageType: string = await getProjectType(folderPath);
    if (languageType === TemplateLanguage.Java) {
        folderPath = await getJavaFolderPath(outputChannel, folderPath, ui);
        await updateJavaFunctionAppSettings(outputChannel, client, siteWrapper);
    }

    await siteWrapper.deployZip(folderPath, client, outputChannel);
}

async function getJavaFolderPath(outputChannel: vscode.OutputChannel, basePath: string, ui: IUserInterface): Promise<string> {
    outputChannel.show();
    await cpUtils.executeCommand(outputChannel, basePath, 'mvn', 'clean', 'package', '-B');
    const targetFolder: string = path.join(basePath, 'target', 'azure-functions');
    if (!fse.pathExistsSync(targetFolder)) {
        throw new NoPackagedJavaFunctionError();
    }
    const packagedFolders: string[] = fse.readdirSync(targetFolder);
    if (packagedFolders.length === 0) {
        throw new NoPackagedJavaFunctionError();
    } else if (packagedFolders.length === 1) {
        return path.join(targetFolder, packagedFolders[0]);
    } else {
        return path.join(targetFolder, await promptForPackagedFolder(ui, packagedFolders));
    }
}

async function promptForPackagedFolder(ui: IUserInterface, folders: string[]): Promise<string> {
    const picks: Pick[] = folders.reduce(
        (ret: Pick[], item: string): Pick[] => {
            return ret.concat(new Pick(item));
        },
        []
    );

    const placeHolder: string = localize('azFunc.PackagedFolderPlaceholder', 'Select packaged folder you want to deploy');
    return (await ui.showQuickPick(picks, placeHolder, false)).label;
}

async function updateJavaFunctionAppSettings(outputChannel: vscode.OutputChannel, client: WebSiteManagementClient, siteWrapper: SiteWrapper): Promise<void> {
    const appSettings: StringDictionary = await client.webApps.listApplicationSettings(siteWrapper.resourceGroup, siteWrapper.appName);
    // tslint:disable-next-line:no-string-literal
    if (appSettings['properties']['FUNCTIONS_EXTENSION_VERSION'] !== 'beta') {
        outputChannel.appendLine(localize('azFunc.updateJavaFunctionRuntime', 'Updating FUNCTIONS_EXTENSION_VERSION to beta to support Java runtime...'));
        // tslint:disable-next-line:no-string-literal
        appSettings['properties']['FUNCTIONS_EXTENSION_VERSION'] = 'beta';
        await client.webApps.updateApplicationSettings(
            siteWrapper.resourceGroup,
            siteWrapper.appName,
            appSettings
        );
    }
}
