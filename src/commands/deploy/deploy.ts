/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteConfigResource, StringDictionary } from '@azure/arm-appservice';
import { deploy as innerDeploy, getDeployFsPath, getDeployNode, IDeployContext, IDeployPaths, showDeployConfirmation, SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { DialogResponses, IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ConnectionKey, ConnectionKeyValues, ConnectionType, deploySubpathSetting, DurableBackend, DurableBackendValues, functionFilter, localEventHubsEmulatorConnectionRegExp, localStorageEmulatorConnectionString, ProjectLanguage, remoteBuildSetting, ScmType } from '../../constants';
import { ext } from '../../extensionVariables';
import { getLocalConnectionString, validateStorageConnection } from '../../funcConfig/local.settings';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize, overwriteRemoteConnection } from '../../localize';
import { ResolvedFunctionAppResource } from '../../tree/ResolvedFunctionAppResource';
import { SlotTreeItem } from '../../tree/SlotTreeItem';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { durableUtils, netheriteUtils, sqlUtils } from '../../utils/durableUtils';
import { isPathEqual } from '../../utils/fs';
import { treeUtils } from '../../utils/treeUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { tryGetFunctionProjectRoot } from '../createNewProject/verifyIsProject';
import { notifyDeployComplete } from './notifyDeployComplete';
import { runPreDeployTask } from './runPreDeployTask';
import { validateRemoteBuild } from './validateRemoteBuild';
import { verifyAppSettings } from './verifyAppSettings';

export async function deployProductionSlot(context: IActionContext, target?: vscode.Uri | string | SlotTreeItem, functionAppId?: string | {}): Promise<void> {
    await deploy(context, target, functionAppId, new RegExp(ResolvedFunctionAppResource.productionContextValue));
}

export async function deploySlot(context: IActionContext, target?: vscode.Uri | string | SlotTreeItem, functionAppId?: string | {}): Promise<void> {
    await deploy(context, target, functionAppId, new RegExp(ResolvedFunctionAppResource.pickSlotContextValue));
}

async function deploy(actionContext: IActionContext, arg1: vscode.Uri | string | SlotTreeItem | undefined, arg2: string | {} | undefined, expectedContextValue: string | RegExp): Promise<void> {
    const deployPaths: IDeployPaths = await getDeployFsPath(actionContext, arg1);

    addLocalFuncTelemetry(actionContext, deployPaths.workspaceFolder.uri.fsPath);

    const context: IDeployContext = Object.assign(actionContext, deployPaths, { defaultAppSetting: 'defaultFunctionAppToDeploy' });
    if (treeUtils.isAzExtTreeItem(arg1)) {
        if (!arg1.contextValue.match(ResolvedFunctionAppResource.pickSlotContextValue) &&
            !arg1.contextValue.match(ResolvedFunctionAppResource.productionContextValue)) {
            // if the user uses the deploy button, it's possible for the local project node to be passed in, so we should reset it to undefined
            arg1 = undefined;
        }
    }

    const node: SlotTreeItem = await getDeployNode(context, ext.rgApi.tree, arg1, arg2, async () => ext.rgApi.pickAppResource(context, {
        filter: functionFilter,
        expectedChildContextValue: expectedContextValue
    }));

    const { language, version } = await verifyInitForVSCode(context, context.effectiveDeployFsPath);

    context.telemetry.properties.projectLanguage = language;
    context.telemetry.properties.projectRuntime = version;
    // TODO: telemetry for language model.

    const durableStorageType: DurableBackendValues | undefined = await durableUtils.getStorageTypeFromWorkspace(language);
    context.telemetry.properties.projectDurableStorageType = durableStorageType;

    if (language === ProjectLanguage.Python && !node.site.isLinux) {
        context.errorHandling.suppressReportIssue = true;
        throw new Error(localize('pythonNotAvailableOnWindows', 'Python projects are not supported on Windows Function Apps. Deploy to a Linux Function App instead.'));
    }

    const client = await node.site.createClient(actionContext);
    const siteConfig: SiteConfigResource = await client.getSiteConfig();
    const isConsumption: boolean = await client.getIsConsumption(actionContext);
    let isZipDeploy: boolean = siteConfig.scmType !== ScmType.LocalGit && siteConfig.scmType !== ScmType.GitHub;
    if (!isZipDeploy && node.site.isLinux && isConsumption) {
        ext.outputChannel.appendLog(localize('linuxConsZipOnly', 'WARNING: Using zip deploy because scm type "{0}" is not supported on Linux consumption', siteConfig.scmType), { resourceName: node.site.fullName });
        isZipDeploy = true;
        context.deployMethod = 'zip';
    }

    const [shouldValidateStorageConnection, shouldValidateNetheriteConnection, shouldValidateSqlDbConnection] = await shouldValidateConnections(context, durableStorageType, client);

    const doRemoteBuild: boolean | undefined = getWorkspaceSetting<boolean>(remoteBuildSetting, deployPaths.effectiveDeployFsPath);
    actionContext.telemetry.properties.scmDoBuildDuringDeployment = String(doRemoteBuild);
    if (doRemoteBuild) {
        await validateRemoteBuild(context, node.site, context.workspaceFolder, language);
    }

    if (isZipDeploy && node.site.isLinux && isConsumption && !doRemoteBuild) {
        context.deployMethod = 'storage';
    }

    // Preliminary local validation done to ensure all required resources have been created for the connection, final deploy choices are made in 'verifyAppSettings'
    switch (durableStorageType) {
        case DurableBackend.Netherite:
            if (shouldValidateNetheriteConnection) {
                await netheriteUtils.validateConnection(context, { setConnectionForDeploy: true, preSelectedConnectionType: ConnectionType.Azure });
            }
            break;
        case DurableBackend.SQL:
            if (shouldValidateSqlDbConnection) {
                await sqlUtils.validateConnection(context, { setConnectionForDeploy: true });
            }
            break;
        case DurableBackend.Storage:
        default:
    }

    if (shouldValidateStorageConnection) {
        await validateStorageConnection(context, { setConnectionForDeploy: true, preSelectedConnectionType: ConnectionType.Azure });
    }

    if (getWorkspaceSetting<boolean>('showDeployConfirmation', context.workspaceFolder.uri.fsPath) && !context.isNewApp && isZipDeploy) {
        await showDeployConfirmation(context, node.site, 'azureFunctions.deploy');
    }

    await runPreDeployTask(context, context.effectiveDeployFsPath, siteConfig.scmType);

    if (isZipDeploy) {
        void validateGlobSettings(context, context.effectiveDeployFsPath);
    }

    if (language === ProjectLanguage.CSharp && !node.site.isLinux || durableStorageType) {
        await updateWorkerProcessTo64BitIfRequired(context, siteConfig, node, language, durableStorageType);
    }

    if (isZipDeploy) {
        const projectPath = await tryGetFunctionProjectRoot(context, deployPaths.workspaceFolder);
        await verifyAppSettings(context, node, projectPath, version, language, { doRemoteBuild, isConsumption }, durableStorageType);
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

    await notifyDeployComplete(context, node, context.workspaceFolder);
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

export async function shouldValidateConnections(context: IActionContext, durableStorageType: DurableBackendValues | undefined, client: SiteClient, projectPath?: string): Promise<[boolean, boolean, boolean]> {
    const app: StringDictionary = await client.listApplicationSettings();
    const remoteStorageConnection: string | undefined = app?.properties?.[ConnectionKey.Storage];
    const remoteEventHubsConnection: string | undefined = app?.properties?.[ConnectionKey.EventHub];
    const remoteSqlDbConnection: string | undefined = app?.properties?.[ConnectionKey.SQL];

    const localStorageConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.Storage, projectPath);
    const localEventHubsConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.EventHub, projectPath);
    const localSqlDbConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.SQL, projectPath);

    const netheriteHubName: string | undefined = await netheriteUtils.getEventHubName(projectPath);
    const hasValidNetheriteHubName: boolean = !!netheriteHubName && netheriteHubName !== netheriteUtils.defaultNetheriteHubName;

    const shouldValidateStorage: boolean = !remoteStorageConnection ||
        (!!localStorageConnection &&
            localStorageConnection !== localStorageEmulatorConnectionString &&
            remoteStorageConnection !== localStorageConnection &&
            await promptShouldOverwrite(context, ConnectionKey.Storage));

    const shouldValidateEventHubs: boolean = durableStorageType === DurableBackend.Netherite &&
        !hasValidNetheriteHubName ||
        (!remoteEventHubsConnection ||
            (!!localEventHubsConnection &&
                !localEventHubsEmulatorConnectionRegExp.test(localEventHubsConnection) &&
                remoteEventHubsConnection !== localEventHubsConnection &&
                await promptShouldOverwrite(context, ConnectionKey.EventHub)));

    const shouldValidateSqlDb: boolean = durableStorageType === DurableBackend.SQL &&
        (!remoteSqlDbConnection ||
            (!!localSqlDbConnection &&
                remoteSqlDbConnection !== localSqlDbConnection &&
                await promptShouldOverwrite(context, ConnectionKey.SQL)));

    return [shouldValidateStorage, shouldValidateEventHubs, shouldValidateSqlDb];
}

export async function promptShouldOverwrite(context: IActionContext, key: ConnectionKeyValues): Promise<boolean> {
    const overwriteButton: vscode.MessageItem = { title: localize('overwrite', 'Overwrite') };
    const skipButton: vscode.MessageItem = { title: localize('skip', 'Skip') };
    const buttons: vscode.MessageItem[] = [overwriteButton, skipButton];

    const message: string = overwriteRemoteConnection(key);

    const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { modal: true }, ...buttons);

    if (result === overwriteButton) {
        return true;
    } else {
        return false;
    }
}
