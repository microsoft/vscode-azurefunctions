/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteConfigResource, StringDictionary } from 'azure-arm-website/lib/models';
import * as fse from 'fs-extra';
// tslint:disable-next-line:no-require-imports
import opn = require("opn");
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MessageItem } from 'vscode';
import { SiteClient } from 'vscode-azureappservice';
import * as appservice from 'vscode-azureappservice';
import { AzureTreeDataProvider, DialogResponses, IActionContext, IAzureNode, IAzureParentNode, IAzureUserInput, TelemetryProperties, UserCancelledError } from 'vscode-azureextensionui';
import { deploySubpathSetting, extensionPrefix, funcPackId, installExtensionsId, preDeployTaskSetting, ProjectLanguage, ProjectRuntime, publishTaskId, ScmType } from '../constants';
import { ArgumentError } from '../errors';
import { ext } from '../extensionVariables';
import { HttpAuthLevel } from '../FunctionConfig';
import { localize } from '../localize';
import { convertStringToRuntime, getFuncExtensionSetting, getProjectLanguage, getProjectRuntime, updateGlobalSetting } from '../ProjectSettings';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import { FunctionsTreeItem } from '../tree/FunctionsTreeItem';
import { FunctionTreeItem } from '../tree/FunctionTreeItem';
import { isPathEqual, isSubpath } from '../utils/fs';
import { getCliFeedAppSettings } from '../utils/getCliFeedJson';
import { mavenUtils } from '../utils/mavenUtils';
import * as workspaceUtil from '../utils/workspace';
import { startStreamingLogs } from './logstream/startStreamingLogs';

// tslint:disable-next-line:max-func-body-length
export async function deploy(ui: IAzureUserInput, actionContext: IActionContext, tree: AzureTreeDataProvider, outputChannel: vscode.OutputChannel, target?: vscode.Uri | string | IAzureParentNode<FunctionAppTreeItem>, functionAppId?: string | {}): Promise<void> {
    const telemetryProperties: TelemetryProperties = actionContext.properties;
    let deployFsPath: string;
    const newNodes: IAzureNode<FunctionAppTreeItem>[] = [];
    let node: IAzureParentNode<FunctionAppTreeItem> | undefined;

    if (target instanceof vscode.Uri) {
        deployFsPath = await appendDeploySubpathSetting(target.fsPath);
    } else if (typeof target === 'string') {
        deployFsPath = await appendDeploySubpathSetting(target);
    } else {
        deployFsPath = await getDeployFsPath();
        node = target;
    }

    const folderOpenWarning: string = localize('folderOpenWarning', 'Failed to deploy because the folder is not open in a workspace. Open in a workspace and try again.');
    await workspaceUtil.ensureFolderIsOpen(deployFsPath, actionContext, folderOpenWarning, true /* allowSubFolder */);

    const onNodeCreatedFromQuickPickDisposable: vscode.Disposable = tree.onNodeCreate((newNode: IAzureNode<FunctionAppTreeItem>) => {
        // event is fired from azure-extensionui if node was created during deployment
        newNodes.push(newNode);
    });
    try {
        if (!node) {
            if (!functionAppId || typeof functionAppId !== 'string') {
                node = <IAzureParentNode<FunctionAppTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
            } else {
                const functionAppNode: IAzureNode | undefined = await tree.findNode(functionAppId);
                if (functionAppNode) {
                    node = <IAzureParentNode<FunctionAppTreeItem>>functionAppNode;
                } else {
                    throw new Error(localize('noMatchingFunctionApp', 'Failed to find a function app matching id "{0}".', functionAppId));
                }
            }
        }
    } finally {
        onNodeCreatedFromQuickPickDisposable.dispose();
    }

    // if the node selected for deployment is the same newly created nodes, stifle the confirmDeployment dialog
    const confirmDeployment: boolean = !newNodes.some((newNode: IAzureNode) => !!node && newNode.id === node.id);

    const client: SiteClient = node.treeItem.client;
    const language: ProjectLanguage = await getProjectLanguage(deployFsPath, ui);
    telemetryProperties.projectLanguage = language;
    const runtime: ProjectRuntime = await getProjectRuntime(language, deployFsPath, ui);
    telemetryProperties.projectRuntime = runtime;

    if (language === ProjectLanguage.Java) {
        deployFsPath = await getJavaFolderPath(actionContext, outputChannel, deployFsPath, ui, telemetryProperties);
    }

    await verifyRuntimeIsCompatible(runtime, ui, outputChannel, client, telemetryProperties);

    const siteConfig: SiteConfigResource = await client.getSiteConfig();
    const isZipDeploy: boolean = siteConfig.scmType !== ScmType.LocalGit && siteConfig !== ScmType.GitHub;
    if (confirmDeployment && isZipDeploy) {
        const warning: string = localize('confirmDeploy', 'Are you sure you want to deploy to "{0}"? This will overwrite any previous deployment and cannot be undone.', client.fullName);
        telemetryProperties.cancelStep = 'confirmDestructiveDeployment';
        const deployButton: vscode.MessageItem = { title: localize('deploy', 'Deploy') };
        await ui.showWarningMessage(warning, { modal: true }, deployButton, DialogResponses.cancel);
        telemetryProperties.cancelStep = '';
    }

    await runPreDeployTask(deployFsPath, telemetryProperties, language, isZipDeploy, runtime);

    await node.runWithTemporaryDescription(
        localize('deploying', 'Deploying...'),
        async () => {
            try {
                // Stop function app here to avoid *.jar file in use on server side.
                // More details can be found: https://github.com/Microsoft/vscode-azurefunctions/issues/106
                if (language === ProjectLanguage.Java) {
                    outputChannel.appendLine(localize('stopFunctionApp', 'Stopping Function App: {0} ...', client.fullName));
                    await client.stop();
                }
                await appservice.deploy(client, deployFsPath, extensionPrefix, telemetryProperties);
            } finally {
                if (language === ProjectLanguage.Java) {
                    outputChannel.appendLine(localize('startFunctionApp', 'Starting Function App: {0} ...', client.fullName));
                    await client.start();
                }
            }
        }
    );

    const deployComplete: string = localize('deployComplete', 'Deployment to "{0}" completed.', client.fullName);
    ext.outputChannel.appendLine(deployComplete);
    const viewOutput: MessageItem = { title: localize('viewOutput', 'View Output') };
    const streamLogs: MessageItem = { title: localize('streamLogs', 'Stream Logs') };

    // Don't wait
    vscode.window.showInformationMessage(deployComplete, streamLogs, viewOutput).then(async (result: MessageItem | undefined) => {
        if (result === viewOutput) {
            ext.outputChannel.show();
        } else if (result === streamLogs) {
            await startStreamingLogs(node);
        }
    });

    await listHttpTriggerUrls(node, actionContext);
}

async function listHttpTriggerUrls(node: IAzureParentNode, actionContext: IActionContext): Promise<void> {
    try {
        const children: IAzureNode[] = await node.getCachedChildren();
        const functionsNode: IAzureParentNode<FunctionsTreeItem> = <IAzureParentNode<FunctionsTreeItem>>children.find((n: IAzureNode) => n.treeItem instanceof FunctionsTreeItem);
        await node.treeDataProvider.refresh(functionsNode);
        const functions: IAzureNode[] = await functionsNode.getCachedChildren();
        const anonFunctions: IAzureNode<FunctionTreeItem>[] = <IAzureNode<FunctionTreeItem>[]>functions.filter((f: IAzureNode) => f.treeItem instanceof FunctionTreeItem && f.treeItem.config.isHttpTrigger && f.treeItem.config.authLevel === HttpAuthLevel.anonymous);
        if (anonFunctions.length > 0) {
            ext.outputChannel.appendLine(localize('anonymousFunctionUrls', 'HTTP Trigger Urls:'));
            for (const func of anonFunctions) {
                ext.outputChannel.appendLine(`  ${func.treeItem.label}: ${func.treeItem.triggerUrl}`);
            }
        }

        if (functions.find((f: IAzureNode) => f.treeItem instanceof FunctionTreeItem && f.treeItem.config.isHttpTrigger && f.treeItem.config.authLevel !== HttpAuthLevel.anonymous)) {
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
                            ext.ui.showWarningMessage(message, { title: localize('ok', 'OK') }, DialogResponses.dontWarnAgain).then(async (result: MessageItem) => {
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

async function getJavaFolderPath(actionContext: IActionContext, outputChannel: vscode.OutputChannel, basePath: string, ui: IAzureUserInput, telemetryProperties: TelemetryProperties): Promise<string> {
    await mavenUtils.validateMavenInstalled(actionContext, basePath);
    outputChannel.show();
    await mavenUtils.executeMvnCommand(telemetryProperties, outputChannel, basePath, 'clean', 'package', '-B');
    const pomLocation: string = path.join(basePath, 'pom.xml');
    const functionAppName: string | undefined = await mavenUtils.getFunctionAppNameInPom(pomLocation);
    const targetFolder: string = functionAppName ? path.join(basePath, 'target', 'azure-functions', functionAppName) : '';
    if (functionAppName && await fse.pathExists(targetFolder)) {
        return targetFolder;
    } else {
        const message: string = localize('azFunc.cannotFindPackageFolder', 'Cannot find the packaged function folder, would you like to specify the folder location?');
        await ui.showWarningMessage(message, DialogResponses.yes, DialogResponses.cancel);
        return (await ui.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri : undefined,
            openLabel: localize('select', 'Select')
        }))[0].fsPath;
    }
}

async function verifyRuntimeIsCompatible(localRuntime: ProjectRuntime, ui: IAzureUserInput, outputChannel: vscode.OutputChannel, client: SiteClient, telemetryProperties: TelemetryProperties): Promise<void> {
    const appSettings: StringDictionary = await client.listApplicationSettings();
    if (!appSettings.properties) {
        throw new ArgumentError(appSettings);
    } else {
        const rawAzureRuntime: string = appSettings.properties.FUNCTIONS_EXTENSION_VERSION;
        const azureRuntime: ProjectRuntime | undefined = convertStringToRuntime(rawAzureRuntime);
        // If we can't recognize the Azure runtime (aka it's undefined), just assume it's compatible
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

async function runPreDeployTask(deployFsPath: string, telemetryProperties: TelemetryProperties, language: ProjectLanguage, isZipDeploy: boolean, runtime: ProjectRuntime): Promise<void> {
    let taskName: string | undefined = getFuncExtensionSetting(preDeployTaskSetting, deployFsPath);
    if (!isZipDeploy) {
        // We don't run pre deploy tasks for non-zipdeploy since that stuff should be handled by kudu

        if (taskName) {
            // We only need to warn if they have the setting defined
            ext.outputChannel.appendLine(localize('ignoringPreDeployTask', 'WARNING: Ignoring preDeployTask "{0}" for non-zip deploy.', taskName));
        }

        return;
    }

    const isTaskNameDefinedInSettings: boolean = !!taskName;
    if (!taskName) {
        switch (language) {
            case ProjectLanguage.CSharp:
                taskName = publishTaskId;
                break;
            case ProjectLanguage.JavaScript:
                if (runtime === ProjectRuntime.v1) {
                    return; // "func extensions install" is only supported on v2
                } else {
                    taskName = installExtensionsId;
                }
                break;
            case ProjectLanguage.Python:
                taskName = funcPackId;
                break;
            default:
                return; // preDeployTask not needed
        }
    }
    telemetryProperties.preDeployTask = taskName;

    const tasks: vscode.Task[] = await vscode.tasks.fetchTasks();
    let preDeployTask: vscode.Task | undefined;
    for (const task of tasks) {
        if (task.name.toLowerCase() === taskName.toLowerCase() && task.scope !== undefined) {
            const workspaceFolder: vscode.WorkspaceFolder = <vscode.WorkspaceFolder>task.scope;
            if (<vscode.Uri | undefined>workspaceFolder.uri && (isPathEqual(workspaceFolder.uri.fsPath, deployFsPath) || isSubpath(workspaceFolder.uri.fsPath, deployFsPath))) {
                preDeployTask = task;
                break;
            }
        }
    }

    if (preDeployTask) {
        telemetryProperties.foundPreDeployTask = 'true';
        await vscode.tasks.executeTask(preDeployTask);
        await new Promise((resolve: () => void): void => {
            const listener: vscode.Disposable = vscode.tasks.onDidEndTask((e: vscode.TaskEndEvent) => {
                if (e.execution.task === preDeployTask) {
                    resolve();
                    listener.dispose();
                }
            });
        });
    } else {
        telemetryProperties.foundPreDeployTask = 'false';

        const messageLines: string[] = [];
        // If the task name was specified in the user's settings, we will throw an error and block the user's deploy if we can't find that task
        // If the task name was _not_ specified, we will display a warning and let the deployment continue. (The preDeployTask isn't _always_ necessary and we don't want to block old projects that never had this setting)
        if (isTaskNameDefinedInSettings) {
            messageLines.push(localize('noPreDeployTaskError', 'Did not find preDeploy task "{0}". Change the "{1}.{2}" setting, manually edit your task.json, or re-initialize your VS Code config with the following steps:', taskName, extensionPrefix, preDeployTaskSetting));
        } else {
            messageLines.push(localize('noPreDeployTaskWarning', 'WARNING: Did not find preDeploy task "{0}". The deployment will continue, but the selected folder may not reflect your latest changes.', taskName));
            messageLines.push(localize('howToAddPreDeploy', 'In order to ensure that you always deploy your latest changes, add a preDeploy task with the following steps:'));
        }

        messageLines.push(localize('howToAddPreDeploy1', '1. Open Command Palette (View -> Command Palette...)'));
        messageLines.push(localize('howToAddPreDeploy2', '2. Search for "Azure Functions" and run command "Initialize project for use with VS Code"'));
        messageLines.push(localize('howToAddPreDeploy3', '3. Select "Yes" to overwrite your tasks.json file when prompted'));

        const fullMessage: string = messageLines.join(os.EOL);
        if (isTaskNameDefinedInSettings) {
            throw new Error(fullMessage);
        } else {
            ext.outputChannel.show(true);
            ext.outputChannel.appendLine(fullMessage);
        }
    }
}
