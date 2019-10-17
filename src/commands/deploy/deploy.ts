/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import * as vscode from 'vscode';
import * as appservice from 'vscode-azureappservice';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { deploySubpathSetting, ProjectLanguage, ProjectRuntime, ScmType } from '../../constants';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { SlotTreeItem } from '../../tree/SlotTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { isPathEqual } from '../../utils/fs';
import * as workspaceUtil from '../../utils/workspace';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { getDeployNode, IDeployNode } from './getDeployNode';
import { notifyDeployComplete } from './notifyDeployComplete';
import { runPreDeployTask } from './runPreDeployTask';
import { validateRemoteBuild } from './validateRemoteBuild';
import { verifyAppSettings } from './verifyAppSettings';

export async function deployProductionSlot(context: IActionContext, target?: vscode.Uri | string | SlotTreeItemBase, functionAppId?: string | {}): Promise<void> {
    await deploy(context, target, functionAppId, ProductionSlotTreeItem.contextValue);
}

export async function deploySlot(context: IActionContext, target?: vscode.Uri | string | SlotTreeItemBase, functionAppId?: string | {}): Promise<void> {
    await deploy(context, target, functionAppId, SlotTreeItem.contextValue);
}

async function deploy(context: IActionContext, target: vscode.Uri | string | SlotTreeItemBase | undefined, functionAppId: string | {} | undefined, expectedContextValue: string): Promise<void> {
    addLocalFuncTelemetry(context);

    const { originalDeployFsPath, effectiveDeployFsPath } = await appservice.getDeployFsPath(target, ext.prefix);
    const workspaceFolder: vscode.WorkspaceFolder | undefined = workspaceUtil.getContainingWorkspace(effectiveDeployFsPath);
    if (!workspaceFolder) {
        throw new Error(localize('folderOpenWarning', 'Failed to deploy because the path is not part of an open workspace. Open in a workspace and try again.'));
    }

    const { node, isNewFunctionApp }: IDeployNode = await getDeployNode(context, target, functionAppId, expectedContextValue);

    const [language, runtime]: [ProjectLanguage, ProjectRuntime] = await verifyInitForVSCode(context, effectiveDeployFsPath);
    context.telemetry.properties.projectLanguage = language;
    context.telemetry.properties.projectRuntime = runtime;

    if (language === ProjectLanguage.Python && !node.root.client.isLinux) {
        throw new Error(localize('pythonNotAvailableOnWindows', 'Python projects are not supported on Windows Function Apps.  Deploy to a Linux Function App instead.'));
    }

    await validateRemoteBuild(context, node.root.client, workspaceFolder.uri.fsPath, language);

    await verifyAppSettings(context, node, runtime, language);

    const siteConfig: WebSiteManagementModels.SiteConfigResource = await node.root.client.getSiteConfig();
    const isZipDeploy: boolean = siteConfig.scmType !== ScmType.LocalGit && siteConfig !== ScmType.GitHub;
    if (!isNewFunctionApp && isZipDeploy) {
        const warning: string = localize('confirmDeploy', 'Are you sure you want to deploy to "{0}"? This will overwrite any previous deployment and cannot be undone.', node.root.client.fullName);
        context.telemetry.properties.cancelStep = 'confirmDestructiveDeployment';
        const deployButton: vscode.MessageItem = { title: localize('deploy', 'Deploy') };
        await ext.ui.showWarningMessage(warning, { modal: true }, deployButton, DialogResponses.cancel);
        context.telemetry.properties.cancelStep = '';
    }

    await runPreDeployTask(context, effectiveDeployFsPath, siteConfig.scmType);

    if (isZipDeploy) {
        // tslint:disable-next-line:no-floating-promises
        validateGlobSettings(context, effectiveDeployFsPath);
    }

    await node.runWithTemporaryDescription(
        localize('deploying', 'Deploying...'),
        async () => {
            try {
                // Stop function app here to avoid *.jar file in use on server side.
                // More details can be found: https://github.com/Microsoft/vscode-azurefunctions/issues/106
                if (language === ProjectLanguage.Java) {
                    ext.outputChannel.appendLog(localize('stopFunctionApp', 'Stopping Function App: {0} ...', node.root.client.fullName));
                    await node.root.client.stop();
                }
                // preDeploy tasks are only required for zipdeploy so subpath may not exist
                let deployFsPath: string = effectiveDeployFsPath;

                if (!isZipDeploy && !isPathEqual(effectiveDeployFsPath, originalDeployFsPath)) {
                    deployFsPath = originalDeployFsPath;
                    const noSubpathWarning: string = `WARNING: Ignoring deploySubPath "${getWorkspaceSetting(deploySubpathSetting, originalDeployFsPath)}" for non-zip deploy.`;
                    ext.outputChannel.appendLog(noSubpathWarning);
                }

                await appservice.deploy(node.root.client, deployFsPath, context);
            } finally {
                if (language === ProjectLanguage.Java) {
                    ext.outputChannel.appendLog(localize('startFunctionApp', 'Starting Function App: {0} ...', node.root.client.fullName));
                    await node.root.client.start();
                }
            }
        }
    );

    await notifyDeployComplete(context, node, workspaceFolder.uri.fsPath);
}

async function validateGlobSettings(context: IActionContext, fsPath: string): Promise<void> {
    const includeKey: string = 'zipGlobPattern';
    const excludeKey: string = 'zipIgnorePattern';
    const includeSetting: string | undefined = getWorkspaceSetting(includeKey, fsPath);
    const excludeSetting: string | string[] | undefined = getWorkspaceSetting(excludeKey, fsPath);
    if (includeSetting || excludeSetting) {
        context.telemetry.properties.hasOldGlobSettings = 'true';
        const message: string = localize('globSettingRemoved', '"{0}" and "{1}" settings are no longer supported. Instead, place a ".funcignore" file at the root of your repo, using the same syntax as a ".gitignore" file.', includeKey, excludeKey);
        await ext.ui.showWarningMessage(message);
    }
}
