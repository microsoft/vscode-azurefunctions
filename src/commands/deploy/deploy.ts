/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SiteConfigResource } from '@azure/arm-appservice';
import { getDeployFsPath, getDeployNode, deploy as innerDeploy, showDeployConfirmation, type IDeployContext, type IDeployPaths } from '@microsoft/vscode-azext-azureappservice';
import { DialogResponses, type ExecuteActivityContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import type * as vscode from 'vscode';
import { CodeAction, ConnectionType, DurableBackend, ProjectLanguage, ScmType, deploySubpathSetting, functionFilter, hostFileName, remoteBuildSetting, type DurableBackendValues } from '../../constants';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { ResolvedFunctionAppResource } from '../../tree/ResolvedFunctionAppResource';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { createActivityContext } from '../../utils/activityUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { durableUtils } from '../../utils/durableUtils';
import { isPathEqual } from '../../utils/fs';
import { treeUtils } from '../../utils/treeUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { type ISetConnectionSettingContext } from '../appSettings/connectionSettings/ISetConnectionSettingContext';
import { validateEventHubsConnection } from '../appSettings/connectionSettings/eventHubs/validateEventHubsConnection';
import { validateSqlDbConnection } from '../appSettings/connectionSettings/sqlDatabase/validateSqlDbConnection';
import { tryGetFunctionProjectRoot } from '../createNewProject/verifyIsProject';
import { notifyDeployComplete } from './notifyDeployComplete';
import { runPreDeployTask } from './runPreDeployTask';
import { shouldValidateConnections } from './shouldValidateConnection';
import { showCoreToolsWarning } from './showCoreToolsWarning';
import { validateRemoteBuild } from './validateRemoteBuild';
import { verifyAppSettings } from './verifyAppSettings';

export type IFuncDeployContext = IDeployContext & ISetConnectionSettingContext & ExecuteActivityContext;

export async function deployProductionSlot(context: IActionContext, target?: vscode.Uri | string | SlotTreeItem): Promise<void> {
    await deploy(context, target, undefined);
}

export async function deployProductionSlotByFunctionAppId(context: IActionContext, functionAppId?: string | {}): Promise<void> {
    await deploy(context, undefined, functionAppId);
}

export async function deploySlot(context: IActionContext, target?: vscode.Uri | string | SlotTreeItem, functionAppId?: string | {}): Promise<void> {
    await deploy(context, target, functionAppId, new RegExp(ResolvedFunctionAppResource.pickSlotContextValue));
}

async function deploy(actionContext: IActionContext, arg1: vscode.Uri | string | SlotTreeItem | undefined, arg2: string | {} | undefined, expectedContextValue?: string | RegExp): Promise<void> {
    const deployPaths: IDeployPaths = await getDeployFsPath(actionContext, arg1);

    addLocalFuncTelemetry(actionContext, deployPaths.workspaceFolder.uri.fsPath);

    const projectPath: string | undefined = await tryGetFunctionProjectRoot(actionContext, deployPaths.workspaceFolder);
    if (projectPath === undefined) {
        const message: string = localize('functionProjectRootNotFound', 'No azure function project root could be found. This can be caused by a missing {0} file.', hostFileName);
        throw new Error(message);
    }

    const context: IFuncDeployContext = Object.assign(actionContext, deployPaths, {
        action: CodeAction.Deploy,
        defaultAppSetting: 'defaultFunctionAppToDeploy',
        projectPath,
        ...(await createActivityContext())
    });

    if (treeUtils.isAzExtTreeItem(arg1)) {
        if (!arg1.contextValue.match(ResolvedFunctionAppResource.pickSlotContextValue) &&
            !arg1.contextValue.match(ResolvedFunctionAppResource.productionContextValue) &&
            !arg1.contextValue.match(ResolvedFunctionAppResource.flexContextValue)) {
            // if the user uses the deploy button, it's possible for the local project node to be passed in, so we should reset it to undefined
            arg1 = undefined;
        }
    }

    const node: SlotTreeItem = await getDeployNode(context, ext.rgApi.tree, arg1, arg2, async () => ext.rgApi.pickAppResource(context, {
        filter: functionFilter,
        expectedChildContextValue: expectedContextValue
    }));

    const { language, languageModel, version } = await verifyInitForVSCode(context, context.effectiveDeployFsPath);

    context.telemetry.properties.projectLanguage = language;
    context.telemetry.properties.projectRuntime = version;
    context.telemetry.properties.languageModel = String(languageModel);

    if (language === ProjectLanguage.Python && !node.site.isLinux) {
        context.errorHandling.suppressReportIssue = true;
        throw new Error(localize('pythonNotAvailableOnWindows', 'Python projects are not supported on Windows Function Apps. Deploy to a Linux Function App instead.'));
    }

    void showCoreToolsWarning(context, version, node.site.fullName);

    const client = await node.site.createClient(actionContext);
    const siteConfig: SiteConfigResource = await client.getSiteConfig();
    const isConsumption: boolean = await client.getIsConsumption(actionContext);
    let isZipDeploy: boolean = siteConfig.scmType !== ScmType.LocalGit && siteConfig.scmType !== ScmType.GitHub;
    if (!isZipDeploy && node.site.isLinux && isConsumption) {
        ext.outputChannel.appendLog(localize('linuxConsZipOnly', 'WARNING: Using zip deploy because scm type "{0}" is not supported on Linux consumption', siteConfig.scmType), { resourceName: node.site.fullName });
        isZipDeploy = true;
        context.deployMethod = 'zip';
    }

    const isFlexConsumption: boolean = await client.getIsConsumptionV2(actionContext);
    actionContext.telemetry.properties.isFlexConsumption = String(isFlexConsumption);
    // don't use remote build setting for consumption v2
    const doRemoteBuild: boolean | undefined = getWorkspaceSetting<boolean>(remoteBuildSetting, deployPaths.effectiveDeployFsPath) && !isFlexConsumption;
    actionContext.telemetry.properties.scmDoBuildDuringDeployment = String(doRemoteBuild);
    if (doRemoteBuild) {
        await validateRemoteBuild(context, node.site, context.workspaceFolder, language);
    }

    if (isZipDeploy && node.site.isLinux && isConsumption && !doRemoteBuild) {
        context.deployMethod = 'storage';
    } else if (isFlexConsumption) {
        context.deployMethod = 'flexconsumption';
    }

    const durableStorageType: DurableBackendValues | undefined = await durableUtils.getStorageTypeFromWorkspace(language, context.projectPath);
    context.telemetry.properties.projectDurableStorageType = durableStorageType;

    const { shouldValidateEventHubs, shouldValidateSqlDb } = await shouldValidateConnections(durableStorageType, client, context.projectPath);

    // Preliminary local validation done to ensure all required resources have been created and are available. Final deploy writes are made in 'verifyAppSettings'
    if (shouldValidateEventHubs) {
        await validateEventHubsConnection(context, context.projectPath, { preselectedConnectionType: ConnectionType.Azure });
    }
    if (shouldValidateSqlDb) {
        await validateSqlDbConnection(context, context.projectPath);
    }

    if (getWorkspaceSetting<boolean>('showDeployConfirmation', context.workspaceFolder.uri.fsPath) && !context.isNewApp && isZipDeploy) {
        const deployCommandId = 'azureFunctions.deploy';
        await showDeployConfirmation(context, node.site, deployCommandId);
    }

    await runPreDeployTask(context, context.effectiveDeployFsPath, siteConfig.scmType);

    if (isZipDeploy) {
        void validateGlobSettings(context, context.effectiveDeployFsPath);
    }

    if (language === ProjectLanguage.CSharp && !node.site.isLinux || durableStorageType) {
        await updateWorkerProcessTo64BitIfRequired(context, siteConfig, node, language, durableStorageType);
    }

    // app settings shouldn't be checked with flex consumption plans
    if (isZipDeploy && !isFlexConsumption) {
        await verifyAppSettings({
            context,
            node,
            projectPath: context.projectPath,
            version,
            language,
            languageModel,
            bools: { doRemoteBuild, isConsumption },
            durableStorageType
        });
    }

    await node.runWithTemporaryDescription(
        context,
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

            await innerDeploy(node.site, deployFsPath, context);
        }
    );

    await notifyDeployComplete(context, node, context.workspaceFolder, isFlexConsumption);
}

async function updateWorkerProcessTo64BitIfRequired(context: IDeployContext, siteConfig: SiteConfigResource, node: SlotTreeItem, language: ProjectLanguage, durableStorageType: DurableBackendValues | undefined): Promise<void> {
    const client = await node.site.createClient(context);
    const config: SiteConfigResource = {
        use32BitWorkerProcess: false
    };

    if (durableStorageType === DurableBackend.Netherite) {
        await client.updateConfiguration(config);
        return;
    }

    const functionProject: string | undefined = await tryGetFunctionProjectRoot(context, context.workspaceFolder);
    if (functionProject === undefined) {
        return;
    }
    const projectFiles: dotnetUtils.ProjectFile[] = await dotnetUtils.getProjFiles(context, language, functionProject);
    if (projectFiles.length !== 1) {
        return;
    }
    const platformTarget: string | undefined = await dotnetUtils.tryGetPlatformTarget(projectFiles[0]);
    if (platformTarget === 'x64' && siteConfig.use32BitWorkerProcess === true) {
        const message: string = localize('overwriteSetting', 'The remote app targets "{0}", but your local project targets "{1}". Update remote app to "{1}"?', '32 bit', '64 bit');
        const deployAnyway: vscode.MessageItem = { title: localize('deployAnyway', 'Deploy Anyway') };
        const dialogResult: vscode.MessageItem = await context.ui.showWarningMessage(message, { modal: true, stepName: 'mismatch64bit' }, DialogResponses.yes, deployAnyway);
        if (dialogResult === deployAnyway) {
            return;
        }
        await client.updateConfiguration(config);
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
        await context.ui.showWarningMessage(message, { stepName: 'globSettingRemoved' });
    }
}
