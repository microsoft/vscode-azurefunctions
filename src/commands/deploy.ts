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
import { MessageItem } from 'vscode';
import { SiteWrapper } from 'vscode-azureappservice';
import { AzureTreeDataProvider, IAzureNode, UserCancelledError } from 'vscode-azureextensionui';
import * as xml2js from 'xml2js';
import { DialogResponses } from '../DialogResponses';
import { IUserInterface } from '../IUserInterface';
import { localize } from '../localize';
import { TemplateLanguage } from '../templates/Template';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import { cpUtils } from '../utils/cpUtils';
import { mavenUtils } from '../utils/mavenUtils';
import { nodeUtils } from '../utils/nodeUtils';
import { projectUtils } from '../utils/projectUtils';
import * as workspaceUtil from '../utils/workspace';
import { VSCodeUI } from '../VSCodeUI';

export async function deploy(tree: AzureTreeDataProvider, outputChannel: vscode.OutputChannel, context?: IAzureNode<FunctionAppTreeItem> | vscode.Uri, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    const uri: vscode.Uri | undefined = context && context instanceof vscode.Uri ? context : undefined;
    let node: IAzureNode<FunctionAppTreeItem> | undefined = context && !(context instanceof vscode.Uri) ? context : undefined;

    let folderPath: string = uri ? uri.fsPath : await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectZipDeployFolder', 'Select the folder to zip and deploy'));

    if (!node) {
        node = <IAzureNode<FunctionAppTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
    const siteWrapper: SiteWrapper = node.treeItem.siteWrapper;
    const languageType: string = await projectUtils.getProjectType(folderPath);
    if (languageType === TemplateLanguage.Java) {
        folderPath = await getJavaFolderPath(outputChannel, folderPath, ui);
        await verifyBetaRuntime(outputChannel, client, siteWrapper);
    }

    await siteWrapper.deployZip(folderPath, client, outputChannel);
}

async function getJavaFolderPath(outputChannel: vscode.OutputChannel, basePath: string, ui: IUserInterface): Promise<string> {
    if (!(await mavenUtils.isMavenInstalled(basePath))) {
        throw new Error(localize('azFunc.mvnNotFound', 'Failed to find "maven" on path.'));
    }
    outputChannel.show();
    await cpUtils.executeCommand(outputChannel, basePath, 'mvn', 'clean', 'package', '-B');
    const pomLocation: string = path.join(basePath, 'pom.xml');
    const functionAppName: string | undefined = await getFunctionAppNameInPom(pomLocation);
    const targetFolder: string = functionAppName ? path.join(basePath, 'target', 'azure-functions', functionAppName) : '';
    if (functionAppName && await fse.pathExists(targetFolder)) {
        return targetFolder;
    } else {
        const message: string = localize('azFunc.cannotFindPackageFolder', 'Cannot find the packaged function folder, would you like to specify the folder location?');
        const result: MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.yes, DialogResponses.cancel);
        if (result === DialogResponses.yes) {
            return await ui.showFolderDialog();
        } else {
            throw new UserCancelledError();
        }
    }
}

async function verifyBetaRuntime(outputChannel: vscode.OutputChannel, client: WebSiteManagementClient, siteWrapper: SiteWrapper): Promise<void> {
    const appSettings: StringDictionary = await client.webApps.listApplicationSettings(siteWrapper.resourceGroup, siteWrapper.appName);
    if (appSettings.properties && appSettings.properties.FUNCTIONS_EXTENSION_VERSION !== 'beta') {
        const message: string = localize('azFunc.notBetaRuntime', 'The FUNCTIONS_EXTENSION_VERSION is not beta. To enable Java function runtime, would you like to change the runtime vertion to beta?');
        const result: MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.yes, DialogResponses.cancel);
        if (result === DialogResponses.yes) {
            outputChannel.appendLine(localize('azFunc.updateJavaFunctionRuntime', 'Updating FUNCTIONS_EXTENSION_VERSION to beta...'));
            appSettings.properties.FUNCTIONS_EXTENSION_VERSION = 'beta';
            await client.webApps.updateApplicationSettings(
                siteWrapper.resourceGroup,
                siteWrapper.appName,
                appSettings
            );
        } else {
            throw new UserCancelledError();
        }
    }
}

async function getFunctionAppNameInPom(pomLocation: string): Promise<string | undefined> {
    const pomString: string = await fse.readFile(pomLocation, 'utf-8');
    return await new Promise((resolve: (ret: string | undefined) => void): void => {
        // tslint:disable-next-line:no-any
        xml2js.parseString(pomString, { explicitArray: false }, (err: any, result: any): void => {
            if (result && !err) {
                // tslint:disable-next-line:no-string-literal no-unsafe-any
                if (result['project'] && result['project']['properties']) {
                    // tslint:disable-next-line:no-string-literal no-unsafe-any
                    resolve(result['project']['properties']['functionAppName']);
                    return;
                }
            }
            resolve(undefined);
        });
    });
}
