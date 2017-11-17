/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { StringDictionary } from 'azure-arm-website/lib/models';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { SiteWrapper } from 'vscode-azureappservice';
import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import { DialogResponses } from '../DialogResponses';
import { NoPackagedJavaFunctionError, UserCancelledError } from '../errors';
import { IUserInterface, Pick } from '../IUserInterface';
import { localize } from '../localize';
import { FunctionAppNode } from '../nodes/FunctionAppNode';
import { getWebSiteClient } from '../nodes/SubscriptionNode';
import { TemplateLanguage } from '../templates/Template';
import { cpUtils } from '../utils/cpUtils';
import { projectUtils } from '../utils/projectUtils';
import * as workspaceUtil from '../utils/workspace';
import { VSCodeUI } from '../VSCodeUI';

export async function deploy(explorer: AzureFunctionsExplorer, outputChannel: vscode.OutputChannel, context?: FunctionAppNode | vscode.Uri, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    const uri: vscode.Uri | undefined = context && context instanceof vscode.Uri ? context : undefined;
    let node: FunctionAppNode | undefined = context && context instanceof FunctionAppNode ? context : undefined;

    let folderPath: string = uri ? uri.fsPath : await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectZipDeployFolder', 'Select the folder to zip and deploy'));

    if (!node) {
        node = <FunctionAppNode>(await explorer.showNodePicker(FunctionAppNode.contextValue));
    }

    const client: WebSiteManagementClient = getWebSiteClient(node);
    const siteWrapper: SiteWrapper = node.siteWrapper;
    const languageType: string = await projectUtils.getProjectType(folderPath);
    if (languageType === TemplateLanguage.Java) {
        folderPath = await getJavaFolderPath(outputChannel, folderPath, ui);
        await verifyBetaRuntime(outputChannel, client, siteWrapper);
    }

    await siteWrapper.deployZip(folderPath, client, outputChannel);
}

async function getJavaFolderPath(outputChannel: vscode.OutputChannel, basePath: string, ui: IUserInterface): Promise<string> {
    outputChannel.show();
    await cpUtils.executeCommand(outputChannel, basePath, 'mvn', 'clean', 'package', '-B');
    const targetFolder: string = path.join(basePath, 'target', 'azure-functions');
    if (!await fse.pathExists(targetFolder)) {
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
    const picks: Pick[] = folders.map((f: string) => new Pick(f));

    const placeHolder: string = localize('azFunc.PackagedFolderPlaceholder', 'Select packaged folder you want to deploy');
    return (await ui.showQuickPick(picks, placeHolder, false)).label;
}

async function verifyBetaRuntime(outputChannel: vscode.OutputChannel, client: WebSiteManagementClient, siteWrapper: SiteWrapper): Promise<void> {
    const appSettings: StringDictionary = await client.webApps.listApplicationSettings(siteWrapper.resourceGroup, siteWrapper.appName);
    if (appSettings.properties && appSettings.properties.FUNCTIONS_EXTENSION_VERSION !== 'beta') {
        const message: string = localize('azFunc.notBetaRuntime', 'The FUNCTIONS_EXTENSION_VERSION is not beta. To enable Java function runtime, would you like to change the runtime vertion to beta?');
        const result: string | undefined = await vscode.window.showWarningMessage(message, DialogResponses.yes);
        if (result === DialogResponses.yes) {
            outputChannel.appendLine(localize('azFunc.updateJavaFunctionRuntime', 'Updating FUNCTIONS_EXTENSION_VERSION to beta...'));
            appSettings.properties.FUNCTIONS_EXTENSION_VERSION = 'beta';
            await client.webApps.updateApplicationSettings(
                siteWrapper.resourceGroup,
                siteWrapper.appName,
                appSettings
            );
        } else if (result === undefined) {
            throw new UserCancelledError();
        }
    }
}
