/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import * as vscode from 'vscode';
import * as appservice from 'vscode-azureappservice';
import { AzureTreeItem, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime, ScmType } from '../../constants';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import * as workspaceUtil from '../../utils/workspace';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { getDeployFsPath } from './getDeployFsPath';
import { notifyDeployComplete } from './notifyDeployComplete';
import { runPreDeployTask } from './runPreDeployTask';
import { verifyAppSettings } from './verifyAppSettings';

export async function deploy(actionContext: IActionContext, target?: vscode.Uri | string | SlotTreeItemBase, functionAppId?: string | {}): Promise<void> {
    addLocalFuncTelemetry(actionContext);

    let node: SlotTreeItemBase | undefined;
    let deployFsPath: string = await getDeployFsPath(target);
    if (target instanceof SlotTreeItemBase) {
        node = target;
    }

    const workspaceFolder: vscode.WorkspaceFolder | undefined = workspaceUtil.getContainingWorkspace(deployFsPath);
    if (!workspaceFolder) {
        throw new Error(localize('folderOpenWarning', 'Failed to deploy because the path is not part of an open workspace. Open in a workspace and try again.'));
    }

    const newNodes: SlotTreeItemBase[] = [];
    if (!node) {
        if (!functionAppId || typeof functionAppId !== 'string') {
            // event is fired from azure-extensionui if node was created during deployment
            const disposable: vscode.Disposable = ext.tree.onTreeItemCreate((newNode: SlotTreeItemBase) => { newNodes.push(newNode); });
            try {
                node = <SlotTreeItemBase>await ext.tree.showTreeItemPicker(ProductionSlotTreeItem.contextValue);
            } finally {
                disposable.dispose();
            }
        } else {
            const functionAppNode: AzureTreeItem | undefined = await ext.tree.findTreeItem(functionAppId);
            if (functionAppNode) {
                node = <SlotTreeItemBase>functionAppNode;
            } else {
                throw new Error(localize('noMatchingFunctionApp', 'Failed to find a Function App matching id "{0}".', functionAppId));
            }
        }
    }

    // if the node selected for deployment is the same newly created nodes, stifle the confirmDeployment dialog
    const isNewFunctionApp: boolean = newNodes.some((newNode: AzureTreeItem) => !!node && newNode.fullId === node.fullId);
    actionContext.properties.isNewFunctionApp = String(isNewFunctionApp);

    const client: appservice.SiteClient = node.root.client;
    const [language, runtime]: [ProjectLanguage, ProjectRuntime] = await verifyInitForVSCode(actionContext, deployFsPath);
    actionContext.properties.projectLanguage = language;
    actionContext.properties.projectRuntime = runtime;

    if (language === ProjectLanguage.Python && !node.root.client.isLinux) {
        throw new Error(localize('pythonNotAvailableOnWindows', 'Python projects are not supported on Windows Function Apps.  Deploy to a Linux Function App instead.'));
    }

    await verifyAppSettings(actionContext, node, runtime, language);

    const siteConfig: WebSiteManagementModels.SiteConfigResource = await client.getSiteConfig();
    const isZipDeploy: boolean = siteConfig.scmType !== ScmType.LocalGit && siteConfig !== ScmType.GitHub;
    if (!isNewFunctionApp && isZipDeploy) {
        const warning: string = localize('confirmDeploy', 'Are you sure you want to deploy to "{0}"? actionContext will overwrite any previous deployment and cannot be undone.', client.fullName);
        actionContext.properties.cancelStep = 'confirmDestructiveDeployment';
        const deployButton: vscode.MessageItem = { title: localize('deploy', 'Deploy') };
        await ext.ui.showWarningMessage(warning, { modal: true }, deployButton, DialogResponses.cancel);
        actionContext.properties.cancelStep = '';
    }

    await runPreDeployTask(actionContext, deployFsPath, siteConfig.scmType);

    if (siteConfig.scmType === ScmType.LocalGit) {
        // preDeploy tasks are not required for LocalGit so subpath may not exist
        deployFsPath = workspaceFolder.uri.fsPath;
    }

    if (isZipDeploy) {
        // tslint:disable-next-line:no-floating-promises
        validateGlobSettings(actionContext, deployFsPath);
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
                await appservice.deploy(client, deployFsPath, actionContext);
            } finally {
                if (language === ProjectLanguage.Java) {
                    ext.outputChannel.appendLine(localize('startFunctionApp', 'Starting Function App: {0} ...', client.fullName));
                    await client.start();
                }
            }
        }
    );

    await notifyDeployComplete(actionContext, node, workspaceFolder.uri.fsPath);
}

async function validateGlobSettings(actionContext: IActionContext, fsPath: string): Promise<void> {
    const includeKey: string = 'zipGlobPattern';
    const excludeKey: string = 'zipIgnorePattern';
    const includeSetting: string | undefined = getWorkspaceSetting(includeKey, fsPath);
    const excludeSetting: string | string[] | undefined = getWorkspaceSetting(excludeKey, fsPath);
    if (includeSetting || excludeSetting) {
        actionContext.properties.hasOldGlobSettings = 'true';
        const message: string = localize('globSettingRemoved', '"{0}" and "{1}" settings are no longer supported. Instead, place a ".funcignore" file at the root of your repo, using the same syntax as a ".gitignore" file.', includeKey, excludeKey);
        await ext.ui.showWarningMessage(message);
    }
}
