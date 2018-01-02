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
import { AzureTreeDataProvider, IAzureNode, IAzureParentNode, UserCancelledError } from 'vscode-azureextensionui';
import * as xml2js from 'xml2js';
import { DialogResponses } from '../DialogResponses';
import { ArgumentError } from '../errors';
import { HttpAuthLevel } from '../FunctionConfig';
import { IUserInterface } from '../IUserInterface';
import { localize } from '../localize';
import { convertStringToRuntime, extensionPrefix, getProjectLanguage, getProjectRuntime, ProjectLanguage, ProjectRuntime } from '../ProjectSettings';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import { FunctionsTreeItem } from '../tree/FunctionsTreeItem';
import { FunctionTreeItem } from '../tree/FunctionTreeItem';
import { cpUtils } from '../utils/cpUtils';
import { mavenUtils } from '../utils/mavenUtils';
import { nodeUtils } from '../utils/nodeUtils';
import * as workspaceUtil from '../utils/workspace';
import { VSCodeUI } from '../VSCodeUI';

export async function deploy(telemetryProperties: { [key: string]: string; }, tree: AzureTreeDataProvider, outputChannel: vscode.OutputChannel, context?: IAzureParentNode<FunctionAppTreeItem> | vscode.Uri, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    const uri: vscode.Uri | undefined = context && context instanceof vscode.Uri ? context : undefined;
    let node: IAzureParentNode<FunctionAppTreeItem> | undefined = context && !(context instanceof vscode.Uri) ? context : undefined;

    let folderPath: string = uri ? uri.fsPath : await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectZipDeployFolder', 'Select the folder to zip and deploy'));

    if (!node) {
        node = <IAzureParentNode<FunctionAppTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
    const siteWrapper: SiteWrapper = node.treeItem.siteWrapper;

    const language: ProjectLanguage = await getProjectLanguage(folderPath, ui);
    telemetryProperties.projectLanguage = language;
    const runtime: ProjectRuntime = await getProjectRuntime(language, ui);
    telemetryProperties.projectRuntime = runtime;

    if (language === ProjectLanguage.Java) {
        folderPath = await getJavaFolderPath(outputChannel, folderPath, ui);
    }

    await verifyRuntimeIsCompatible(runtime, outputChannel, client, siteWrapper);

    node.treeItem.state = localize('deploying', 'Deploying...');
    try {
        node.refresh();
        // Stop function app here to avoid *.jar file in use on server side.
        // More details can be found: https://github.com/Microsoft/vscode-azurefunctions/issues/106
        if (language === ProjectLanguage.Java) {
            outputChannel.appendLine(localize('stopFunctionApp', 'Stopping Function App: {0} ...', siteWrapper.appName));
            await siteWrapper.stop(client);
        }
        await siteWrapper.deploy(folderPath, client, outputChannel, extensionPrefix);
    } finally {
        if (language === ProjectLanguage.Java) {
            outputChannel.appendLine(localize('startFunctionApp', 'Starting Function App: {0} ...', siteWrapper.appName));
            await siteWrapper.start(client);
        }
        node.treeItem.state = await node.treeItem.siteWrapper.getState(client);
        node.refresh();
    }

    const children: IAzureNode[] = await node.getCachedChildren();
    const functionsNode: IAzureParentNode<FunctionsTreeItem> = <IAzureParentNode<FunctionsTreeItem>>children.find((n: IAzureNode) => n.treeItem instanceof FunctionsTreeItem);
    node.treeDataProvider.refresh(functionsNode, true /* clearCache */);
    const functions: IAzureNode<FunctionTreeItem>[] = <IAzureNode<FunctionTreeItem>[]>await functionsNode.getCachedChildren();
    const anonFunctions: IAzureNode<FunctionTreeItem>[] = functions.filter((f: IAzureNode<FunctionTreeItem>) => f.treeItem.config.isHttpTrigger && f.treeItem.config.authLevel === HttpAuthLevel.anonymous);
    if (anonFunctions.length > 0) {
        outputChannel.appendLine(localize('anonymousFunctionUrls', 'HTTP Trigger Urls:'));
        for (const func of anonFunctions) {
            outputChannel.appendLine(`  ${func.treeItem.label}: ${func.treeItem.triggerUrl}`);
        }
    }

    if (functions.find((f: IAzureNode<FunctionTreeItem>) => f.treeItem.config.isHttpTrigger && f.treeItem.config.authLevel !== HttpAuthLevel.anonymous)) {
        outputChannel.appendLine(localize('nonAnonymousWarning', 'WARNING: Some http trigger urls cannot be displayed in the output window because they require an authentication token. Instead, you may copy them from the Azure Functions explorer.'));
    }
}

async function getJavaFolderPath(outputChannel: vscode.OutputChannel, basePath: string, ui: IUserInterface): Promise<string> {
    await mavenUtils.validateMavenInstalled(basePath);
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

async function verifyRuntimeIsCompatible(localRuntime: ProjectRuntime, outputChannel: vscode.OutputChannel, client: WebSiteManagementClient, siteWrapper: SiteWrapper): Promise<void> {
    const appSettings: StringDictionary = await client.webApps.listApplicationSettings(siteWrapper.resourceGroup, siteWrapper.appName);
    if (!appSettings.properties) {
        throw new ArgumentError(appSettings);
    } else {
        const rawAzureRuntime: string = appSettings.properties.FUNCTIONS_EXTENSION_VERSION;
        const azureRuntime: ProjectRuntime | undefined = convertStringToRuntime(rawAzureRuntime);
        // If we can't recognize the Azure runtime (aka it's undefined), just assume it's compatible
        if (azureRuntime !== undefined && azureRuntime !== localRuntime) {
            const message: string = localize('azFunc.notBetaRuntime', 'The remote runtime "{0}" is not compatible with your local runtime "{1}". Update remote runtime?', rawAzureRuntime, localRuntime);
            const result: MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.yes, DialogResponses.cancel);
            if (result === DialogResponses.yes) {
                outputChannel.appendLine(localize('azFunc.updateFunctionRuntime', 'Updating FUNCTIONS_EXTENSION_VERSION to "{0}"...', localRuntime));
                appSettings.properties.FUNCTIONS_EXTENSION_VERSION = localRuntime;
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
