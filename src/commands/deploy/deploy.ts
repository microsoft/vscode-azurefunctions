/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type SiteConfigResource, type StringDictionary } from '@azure/arm-appservice';
import { getDeployFsPath, getDeployNode, deploy as innerDeploy, showDeployConfirmation, type IDeployContext, type IDeployPaths, type InnerDeployContext, type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { ResourceGroupListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, DialogResponses, subscriptionExperience, type ExecuteActivityContext, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { type AzureSubscription } from '@microsoft/vscode-azureresources-api';
import type * as vscode from 'vscode';
import { CodeAction, deploySubpathSetting, DurableBackend, hostFileName, ProjectLanguage, remoteBuildSetting, ScmType, stackUpgradeLearnMoreLink } from '../../constants';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { funcToolsInstalled, validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../../localize';
import { ResolvedFunctionAppResource } from '../../tree/ResolvedFunctionAppResource';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { type ICreateFunctionAppContext } from '../../tree/SubscriptionTreeItem';
import { createActivityContext } from '../../utils/activityUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { durableUtils } from '../../utils/durableUtils';
import { isPathEqual } from '../../utils/fs';
import { treeUtils } from '../../utils/treeUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { type ISetConnectionSettingContext } from '../appSettings/connectionSettings/ISetConnectionSettingContext';
import { getStorageConnectionIfNeeded } from '../appSettings/connectionSettings/azureWebJobsStorage/getStorageConnection';
import { getDTSConnectionIfNeeded } from '../appSettings/connectionSettings/durableTaskScheduler/getDTSConnection';
import { getNetheriteConnectionIfNeeded } from '../appSettings/connectionSettings/netherite/getNetheriteConnection';
import { getSQLConnectionIfNeeded } from '../appSettings/connectionSettings/sqlDatabase/getSQLConnection';
import { getEolWarningMessages } from '../createFunctionApp/stacks/getStackPicks';
import { tryGetFunctionProjectRoot } from '../createNewProject/verifyIsProject';
import { DeployFunctionCoreToolsStep } from './DeployFunctionCoreToolsStep';
import { getOrCreateFunctionApp } from './getOrCreateFunctionApp';
import { getWarningsForConnectionSettings } from './getWarningsForConnectionSettings';
import { notifyDeployComplete } from './notifyDeployComplete';
import { runPreDeployTask } from './runPreDeployTask';
import { showCoreToolsWarning } from './showCoreToolsWarning';
import { validateRemoteBuild } from './validateRemoteBuild';
import { verifyAppSettings } from './verifyAppSettings';

// context that is used for deployment but since creation is an option in the deployment command, include ICreateFunctionAppContext
export type IFuncDeployContext = { site?: Site, subscription?: AzureSubscription } &
    Partial<ICreateFunctionAppContext> & IDeployContext & ISetConnectionSettingContext & ExecuteActivityContext;

export async function deployProductionSlot(context: IActionContext, target?: vscode.Uri | string | SlotTreeItem): Promise<void> {
    await deploy(context, target, undefined);
}

export async function deployProductionSlotByFunctionAppId(context: IActionContext, functionAppId?: string | {}): Promise<void> {
    await deploy(context, undefined, functionAppId);
}

export async function deploySlot(context: IActionContext, target?: vscode.Uri | string | SlotTreeItem, functionAppId?: string | {}): Promise<void> {
    await deploy(context, target, functionAppId, new RegExp(ResolvedFunctionAppResource.pickSlotContextValue));
}

async function deploy(actionContext: IActionContext, arg1: vscode.Uri | string | SlotTreeItem | undefined, arg2: string | {} | undefined, _expectedContextValue?: string | RegExp): Promise<void> {
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
        activityAttributes: {
            "description": "Deploys application code to an Azure Functions app using deployment methods such as zip deployment, Azure CLI, or GitHub Actions. This action publishes the app to the specified Function App resource, making it live in the target environment.",
            "troubleshooting": [
                "Deployment succeeds but the app fails to start — check Application Insights or log stream for runtime errors.",
                "Deployment fails due to '403 Forbidden' or '401 Unauthorized' — verify the publishing profile, service principal, or deployment credentials have appropriate permissions.",
                "Code changes are not reflected — ensure you're not deploying to a staging slot or that deployment caching isn't interfering.",
                "Missing or invalid host.json or function.json — validate your app's structure and configuration files.",
                "Dependencies not installed — make sure your build step restores packages before deployment (e.g., npm install, pip install).",
                "Cold start latency after deployment — this is normal for Consumption Plan apps and usually resolves after the first few executions.",
                "Function runtime version mismatch — verify the target runtime version in Azure matches your local dev/runtime settings.",
                "Zip deployment fails with 'conflicting changes' — ensure no simultaneous deployments or file locks are interfering.",
                "Continuous deployment stuck or outdated — check your deployment center logs for GitHub/DevOps pipeline issues.",
                "App Service Plan quota exceeded — check if the Function App’s resource usage has hit limits for memory, CPU, or file system."
            ]
        },
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

    const node: SlotTreeItem = await getDeployNode(context, ext.rgApi.tree, arg1, arg2, async () => {
        return await getOrCreateFunctionApp(context)
    });

    await node.initSite(context);
    const site = node.site;

    const subscriptionContext: ISubscriptionContext & { subscription: AzureSubscription } = {
        ...node.subscription,
        subscription: await subscriptionExperience(context, ext.rgApiV2.resources.azureResourceTreeDataProvider, {
            selectBySubscriptionId: node.subscription.subscriptionId,
        }),
    };

    Object.assign(context, {
        resourceGroup: (await ResourceGroupListStep.getResourceGroups(Object.assign(context, subscriptionContext))).find(rg => rg.name === site.resourceGroup),
    });

    if (node.contextValue.includes('container')) {
        const learnMoreLink: string = 'https://aka.ms/deployContainerApps'
        await context.ui.showWarningMessage(localize('containerFunctionAppError', 'Deploy is not currently supported for containerized function apps within the Azure Functions extension. Please read here to learn how to deploy your project.'), { learnMoreLink });
        //suppress display of error message
        context.errorHandling.suppressDisplay = true;
        context.telemetry.properties.error = 'Deploy not supported for containerized function apps';
        throw new Error();
    }

    const { language, languageModel, version } = await verifyInitForVSCode(context, context.effectiveDeployFsPath);

    context.telemetry.properties.projectLanguage = language;
    context.telemetry.properties.projectRuntime = version;
    context.telemetry.properties.languageModel = String(languageModel);

    if (language === ProjectLanguage.Python && !site.isLinux) {
        context.errorHandling.suppressReportIssue = true;
        throw new Error(localize('pythonNotAvailableOnWindows', 'Python projects are not supported on Windows Function Apps. Deploy to a Linux Function App instead.'));
    }

    void showCoreToolsWarning(context, version, site.fullName);

    const client = await site.createClient(actionContext);
    const siteConfig: SiteConfigResource = await client.getSiteConfig();
    const isConsumption: boolean = await client.getIsConsumption(actionContext);
    let isZipDeploy: boolean = siteConfig.scmType !== ScmType.LocalGit && siteConfig.scmType !== ScmType.GitHub;
    if (!isZipDeploy && site.isLinux && isConsumption) {
        ext.outputChannel.appendLog(localize('linuxConsZipOnly', 'WARNING: Using zip deploy because scm type "{0}" is not supported on Linux consumption', siteConfig.scmType), { resourceName: site.fullName });
        isZipDeploy = true;
        context.deployMethod = 'zip';
    }

    const isFlexConsumption: boolean = await client.getIsConsumptionV2(actionContext);
    actionContext.telemetry.properties.isFlexConsumption = String(isFlexConsumption);
    // don't use remote build setting for consumption v2
    const doRemoteBuild: boolean | undefined = getWorkspaceSetting<boolean>(remoteBuildSetting, deployPaths.effectiveDeployFsPath) && !isFlexConsumption;
    actionContext.telemetry.properties.scmDoBuildDuringDeployment = String(doRemoteBuild);
    if (doRemoteBuild) {
        await validateRemoteBuild(context, site, context.workspaceFolder, language);
    }

    if (isZipDeploy && site.isLinux && isConsumption && !doRemoteBuild) {
        context.deployMethod = 'storage';
    } else if (isFlexConsumption) {
        context.deployMethod = 'flexconsumption';
    }

    const appSettings: StringDictionary = await client.listApplicationSettings();

    const durableStorageType: DurableBackend | undefined = await durableUtils.getStorageTypeFromWorkspace(language, context.projectPath);
    context.telemetry.properties.durableStorageType = durableStorageType;

    if (durableStorageType && !isFlexConsumption) {
        switch (durableStorageType) {
            case DurableBackend.DTS:
                Object.assign(context, await getDTSConnectionIfNeeded(Object.assign(context, subscriptionContext), appSettings, site, context.projectPath));
                break;
            case DurableBackend.Netherite:
                Object.assign(context, await getNetheriteConnectionIfNeeded(Object.assign(context, subscriptionContext), appSettings, site, context.projectPath));
                break;
            case DurableBackend.SQL:
                Object.assign(context, await getSQLConnectionIfNeeded(Object.assign(context, subscriptionContext), appSettings, site, context.projectPath));
                break;
            default:
        }
    }

    if (durableStorageType && durableStorageType !== DurableBackend.Storage && isFlexConsumption) {
        // https://github.com/Azure/azure-functions-durable-extension/issues/2957
        ext.outputChannel.appendLog(localize('durableStorageTypeWarning', 'Warning: Detected a flex consumption app using an incompatible Durable Functions storage provider. Only the Azure Storage backend is supported for Durable Function apps hosted in the Flex Consumption plan.'));
    }

    Object.assign(context, await getStorageConnectionIfNeeded(Object.assign(context, subscriptionContext), appSettings, site, context.projectPath));

    const deploymentWarningMessages: string[] = [];
    const connectionStringWarningMessage = await getWarningsForConnectionSettings(context, {
        appSettings,
        node,
        projectPath: context.projectPath
    });

    if (connectionStringWarningMessage) {
        deploymentWarningMessages.push(connectionStringWarningMessage);
    }

    const eolWarningMessage = await getEolWarningMessages({ ...context, ...subscriptionContext }, {
        site: site.rawSite,
        isLinux: client.isLinux,
        isFlex: isFlexConsumption,
        client
    });

    if (eolWarningMessage) {
        deploymentWarningMessages.push(eolWarningMessage);
    }

    if ((getWorkspaceSetting<boolean>('showDeployConfirmation', context.workspaceFolder.uri.fsPath) && !context.isNewApp && isZipDeploy) ||
        deploymentWarningMessages.length > 0) {
        // if there is a warning message, we want to show the deploy confirmation regardless of the setting
        const deployCommandId = 'azureFunctions.deploy';
        await showDeployConfirmation(context, site, deployCommandId, deploymentWarningMessages,
            eolWarningMessage ? stackUpgradeLearnMoreLink : undefined);
    }

    let isFuncToolsInstalled: boolean = await funcToolsInstalled(context, context.workspaceFolder.uri.fsPath);
    if (language === ProjectLanguage.Custom && !isFuncToolsInstalled) {
        await validateFuncCoreToolsInstalled(context, localize('validateFuncCoreToolsCustom', 'The Functions Core Tools are required to deploy to a custom runtime function app.'));
        isFuncToolsInstalled = true;
    }


    if (!isFuncToolsInstalled) {
        await runPreDeployTask(context, context.effectiveDeployFsPath, siteConfig.scmType);

        if (isZipDeploy) {
            void validateGlobSettings(context, context.effectiveDeployFsPath);
        }

        if (language === ProjectLanguage.CSharp && !site.isLinux || durableStorageType) {
            await updateWorkerProcessTo64BitIfRequired(context, siteConfig, site, language, durableStorageType);
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
                durableStorageType,
                appSettings
            });
        }
    }
    let deployedWithFuncCli = false;
    await node.runWithTemporaryDescription(
        context,
        localize('deploying', 'Deploying...'),
        async () => {
            // only deploy via CLI with the custom runtime for now as it is required for flex consumption
            if (isFuncToolsInstalled && language === ProjectLanguage.Custom && isFlexConsumption) {
                context.telemetry.properties.funcCoreToolsInstalled = 'true';
                context.telemetry.properties.deployMethod = 'funccli';
                const deployContext = Object.assign(context, await createActivityContext(), { site }) as unknown as InnerDeployContext;
                deployContext.activityChildren = [];
                const wizard = new AzureWizard(deployContext, {
                    executeSteps: [new DeployFunctionCoreToolsStep()],
                });

                deployContext.activityTitle = site.isSlot
                    ? localize('deploySlot', 'Deploy to slot "{0}"', site.fullName)
                    : localize('deployApp', 'Deploy to app "{0}"', site.fullName);
                await wizard.execute();
                deployedWithFuncCli = true;
                return;
            } else {
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
                const deployContext = Object.assign(context, await createActivityContext());
                deployContext.activityChildren = [];
                await innerDeploy(site, deployFsPath, deployContext);
            }
        }
    );

    await notifyDeployComplete(context, node, context.workspaceFolder, isFlexConsumption, deployedWithFuncCli);
}

async function updateWorkerProcessTo64BitIfRequired(context: IDeployContext, siteConfig: SiteConfigResource, site: ParsedSite, language: ProjectLanguage, durableStorageType: DurableBackend | undefined): Promise<void> {
    const client = await site.createClient(context);
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

