/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import * as path from 'path';
import * as vscode from 'vscode';
import { deploy as innerDeploy, getDeployFsPath, getDeployNode, IDeployContext, IDeployPaths, showDeployConfirmation } from 'vscode-azureappservice';
import { DialogResponses, IActionContext, IParsedError, parseError } from 'vscode-azureextensionui';
import { deploySubpathSetting, ProjectLanguage, ScmType } from '../../constants';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { SlotTreeItem } from '../../tree/SlotTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { isPathEqual } from '../../utils/fs';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { tryGetFunctionProjectRoot } from '../createNewProject/verifyIsProject';
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

async function deploy(actionContext: IActionContext, arg1: vscode.Uri | string | SlotTreeItemBase | undefined, arg2: string | {} | undefined, expectedContextValue: string): Promise<void> {
    addLocalFuncTelemetry(actionContext);

    const deployPaths: IDeployPaths = await getDeployFsPath(actionContext, arg1);
    const context: IDeployContext = Object.assign(actionContext, deployPaths, { defaultAppSetting: 'defaultFunctionAppToDeploy' });
    const node: SlotTreeItemBase = await getDeployNode(context, ext.tree, arg1, arg2, expectedContextValue);

    const [language, version]: [ProjectLanguage, FuncVersion] = await verifyInitForVSCode(context, context.effectiveDeployFsPath);
    context.telemetry.properties.projectLanguage = language;
    context.telemetry.properties.projectRuntime = version;

    if (language === ProjectLanguage.Python && !node.root.client.isLinux) {
        context.errorHandling.suppressReportIssue = true;
        throw new Error(localize('pythonNotAvailableOnWindows', 'Python projects are not supported on Windows Function Apps. Deploy to a Linux Function App instead.'));
    }

    await validateRemoteBuild(context, node.root.client, context.workspaceFolder.uri.fsPath, language);

    const siteConfig: WebSiteManagementModels.SiteConfigResource = await node.root.client.getSiteConfig();
    const isZipDeploy: boolean = siteConfig.scmType !== ScmType.LocalGit && siteConfig !== ScmType.GitHub;

    if (getWorkspaceSetting<boolean>('showDeployConfirmation', context.workspaceFolder.uri.fsPath) && !context.isNewApp && isZipDeploy) {
        await showDeployConfirmation(context, node.root.client, 'azureFunctions.deploy');
    }

    await runPreDeployTask(context, context.effectiveDeployFsPath, siteConfig.scmType);

    if (isZipDeploy) {
        // tslint:disable-next-line:no-floating-promises
        validateGlobSettings(context, context.effectiveDeployFsPath);
    }

    if (language === ProjectLanguage.CSharp && !node.root.client.isLinux) {
        await tryToUpdateWorkerProcessTo64BitIfRequired(context, siteConfig, node, language);
    }

    await verifyAppSettings(context, node, version, language);

    await node.runWithTemporaryDescription(
        localize('deploying', 'Deploying...'),
        async () => {
            // Stop function app here to avoid *.jar file in use on server side.
            // More details can be found: https://github.com/Microsoft/vscode-azurefunctions/issues/106
            context.stopAppBeforeDeploy = language === ProjectLanguage.Java;

            // preDeploy tasks are only required for zipdeploy so subpath may not exist
            let deployFsPath: string = context.effectiveDeployFsPath;

            if (!isZipDeploy && !isPathEqual(context.effectiveDeployFsPath, context.originalDeployFsPath)) {
                deployFsPath = context.originalDeployFsPath;
                const noSubpathWarning: string = `WARNING: Ignoring deploySubPath "${getWorkspaceSetting(deploySubpathSetting, context.originalDeployFsPath)}" for non-zip deploy.`;
                ext.outputChannel.appendLog(noSubpathWarning);
            }

            await innerDeploy(node.root.client, deployFsPath, context);
        }
    );

    await notifyDeployComplete(context, node, context.workspaceFolder.uri.fsPath);
}

async function tryToUpdateWorkerProcessTo64BitIfRequired(context: IDeployContext, siteConfig: WebSiteManagementModels.SiteConfigResource, node: SlotTreeItemBase, language: ProjectLanguage): Promise<void> {
    try {
        const functionProject: string | undefined = await tryGetFunctionProjectRoot(context.workspaceFolder.uri.fsPath);
        if (functionProject === undefined) {
            throw new Error(localize('failedToFindFuncHost', 'Unable not locate Azure Functions project.'));
        }
        const projectFiles: string[] = await dotnetUtils.getProjFiles(language, functionProject);
        if (projectFiles.length === 0) {
            throw new Error(localize('unableToFindProj', 'Unable to detect project file.'));
        }
        const mainProject: string = path.join(functionProject, projectFiles[0]);
        const platformTarget: string | undefined = await dotnetUtils.tryGetPlatformTarget(mainProject);
        if (platformTarget === 'x64' && siteConfig.use32BitWorkerProcess === true) {
            const message: string = localize('overwriteSetting', 'Detected 64 bit project. Update setting in Azure Portal?');
            const deployAnyway: vscode.MessageItem = { title: localize('deployAnyway', 'Deploy Anyway'), isCloseAffordance: true };
            const dialogResult: vscode.MessageItem = await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes, deployAnyway);
            if (dialogResult.isCloseAffordance === true) {
                return;
            }
            const config: WebSiteManagementModels.SiteConfigResource = {
                use32BitWorkerProcess: false
            };
            // restart fn app otherwise we get error - Function Host is not running
            context.stopAppBeforeDeploy = true;
            await node.root.client.updateConfiguration(config);
        }
    } catch (error) {
        // swallow cancellations
        const parsedError: IParsedError = parseError(error);
        if (!parsedError.isUserCancelledError) {
            return;
        }
        // We try out best to update app to 64 bit
        // If we don't succeed, we shouldn't stop the deployment
        const errorUpdatingTo64Bit: string = `WARNING: Unable to update function app to 64 bit. Please manually update to 64 bit in Azure Portal.`;
        ext.outputChannel.appendLog(errorUpdatingTo64Bit);
        if (parsedError.message !== undefined) {
            ext.outputChannel.appendLog(parsedError.message);
        }
    }
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
