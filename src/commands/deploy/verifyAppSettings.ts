/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from '@azure/arm-appservice';
import { type ParsedSite, type SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as retry from 'p-retry';
import type * as vscode from 'vscode';
import { FuncVersion, tryParseFuncVersion } from '../../FuncVersion';
import { azureWebJobsFeatureFlags, DurableBackend, extensionVersionKey, runFromPackageKey, workerRuntimeKey, type ProjectLanguage } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { isKnownWorkerRuntime, promptToUpdateDotnetRuntime, tryGetFunctionsWorkerRuntimeForProject } from '../../vsCodeConfig/settings';
import { type ISetConnectionSettingContext } from '../appSettings/connectionSettings/ISetConnectionSettingContext';

/**
 * Just putting a few booleans in an object to avoid ordering mistakes if we passed them as individual params
 */
type VerifyAppSettingBooleans = { doRemoteBuild: boolean | undefined; isConsumption: boolean };

export async function verifyAppSettings(options: {
    context: IActionContext,
    node: SlotTreeItem,
    projectPath: string | undefined,
    version: FuncVersion,
    language: ProjectLanguage,
    languageModel: number | undefined,
    bools: VerifyAppSettingBooleans,
    durableStorageType: DurableBackend | undefined,
    appSettings: StringDictionary,
}): Promise<void> {

    const { context, node, projectPath, version, language, bools, durableStorageType } = options;
    await node.initSite(context);
    const client = await node.site.createClient(context);
    const appSettings: StringDictionary = options.appSettings;
    if (appSettings.properties) {
        const remoteRuntime: string | undefined = appSettings.properties[workerRuntimeKey];
        await verifyVersionAndLanguage(context, projectPath, node.site.fullName, version, language, appSettings.properties);

        // update the settings if the remote runtime was changed
        let updateAppSettings: boolean = appSettings.properties[workerRuntimeKey] !== remoteRuntime;
        if (node.site.isLinux) {
            const remoteBuildSettingsChanged = verifyLinuxRemoteBuildSettings(context, appSettings.properties, bools);
            updateAppSettings ||= remoteBuildSettingsChanged;
        } else {
            updateAppSettings ||= verifyRunFromPackage(context, node.site, appSettings.properties);
        }

        if (true /*check for mcp*/) {
            updateAppSettings ||= verifyFeatureFlagSetting(context, node.site, appSettings.properties);
        }

        const updatedRemoteConnection: boolean = await verifyAndUpdateAppConnectionStrings(context, durableStorageType, appSettings.properties);
        updateAppSettings ||= updatedRemoteConnection;

        if (updateAppSettings) {
            await client.updateApplicationSettings(appSettings);
            try {
                await verifyAppSettingsPropagated(context, client, appSettings);
            } catch (e) {
                // don't throw if we can't verify the settings were updated
            }

            // if the user cancels the deployment, the app settings node doesn't reflect the updated settings
            await node.appSettingsTreeItem?.refresh(context);
        }
    }
}

export async function verifyAndUpdateAppConnectionStrings(context: IActionContext & Partial<ISetConnectionSettingContext>, durableStorageType: DurableBackend | undefined, remoteProperties: { [propertyName: string]: string }): Promise<boolean> {
    let didUpdate: boolean = false;
    switch (durableStorageType) {
        case DurableBackend.Netherite:
            if (context.newEventHubsNamespaceConnectionSettingKey && context.newEventHubConnectionSettingValue) {
                const updatedNamespaceConnection: boolean = updateConnectionStringIfNeeded(context, remoteProperties, context.newEventHubsNamespaceConnectionSettingKey, context.newEventHubsNamespaceConnectionSettingValue);
                didUpdate ||= updatedNamespaceConnection;
            }
            if (context.newEventHubConnectionSettingKey && context.newEventHubConnectionSettingValue) {
                const updatedEventHubConnection: boolean = updateConnectionStringIfNeeded(context, remoteProperties, context.newEventHubConnectionSettingKey, context.newEventHubConnectionSettingValue);
                didUpdate ||= updatedEventHubConnection;
            }
            break;
        case DurableBackend.DTS:
            if (context.newDTSConnectionSettingKey && context.newDTSConnectionSettingValue) {
                const updatedDTSConnection: boolean = updateConnectionStringIfNeeded(context, remoteProperties, context.newDTSConnectionSettingKey, context.newDTSConnectionSettingValue);
                didUpdate ||= updatedDTSConnection;
            }
            if (context.newDTSHubConnectionSettingKey && context.newDTSHubConnectionSettingValue) {
                const updatedDTSHub: boolean = updateConnectionStringIfNeeded(context, remoteProperties, context.newDTSHubConnectionSettingKey, context.newDTSHubConnectionSettingValue);
                didUpdate ||= updatedDTSHub;
            }
            break;
        case DurableBackend.SQL:
            if (context.newSQLStorageConnectionSettingKey && context.newSQLStorageConnectionSettingValue) {
                const updatedSqlDbConnection: boolean = updateConnectionStringIfNeeded(context, remoteProperties, context.newSQLStorageConnectionSettingKey, context.newSQLStorageConnectionSettingValue);
                didUpdate ||= updatedSqlDbConnection;
            }
            break;
        case DurableBackend.Storage:
        default:
    }

    if (context.newStorageConnectionSettingKey && context.newStorageConnectionSettingValue) {
        const updatedStorageConnection = updateConnectionStringIfNeeded(context, remoteProperties, context.newStorageConnectionSettingKey, context.newStorageConnectionSettingValue);
        didUpdate ||= updatedStorageConnection;
    }

    return didUpdate;
}

export function updateConnectionStringIfNeeded(context: IActionContext & Partial<ISetConnectionSettingContext>, remoteProperties: { [propertyName: string]: string }, propertyName: string, newValue: string | undefined): boolean {
    if (newValue && newValue !== remoteProperties[propertyName]) {
        remoteProperties[propertyName] = newValue;
        context.telemetry.properties[`update${propertyName}`] = 'true';
        return true;
    } else {
        return false;
    }
}

export async function verifyVersionAndLanguage(context: IActionContext, projectPath: string | undefined, siteName: string, localVersion: FuncVersion, localLanguage: ProjectLanguage, remoteProperties: { [propertyName: string]: string }): Promise<void> {
    const rawAzureVersion: string = remoteProperties[extensionVersionKey];
    const azureVersion: FuncVersion | undefined = tryParseFuncVersion(rawAzureVersion);
    const azureWorkerRuntime: string | undefined = remoteProperties[workerRuntimeKey];

    // Since these are coming from the user's app settings we want to be a bit careful and only track if it's in an expected format
    context.telemetry.properties.remoteVersion = azureVersion || 'Unknown';
    context.telemetry.properties.remoteRuntimeV2 = isKnownWorkerRuntime(azureWorkerRuntime) ? azureWorkerRuntime : 'Unknown';

    const localWorkerRuntime: string | undefined = await tryGetFunctionsWorkerRuntimeForProject(context, localLanguage, projectPath);

    if (localVersion !== FuncVersion.v1 && isKnownWorkerRuntime(azureWorkerRuntime) && isKnownWorkerRuntime(localWorkerRuntime) && azureWorkerRuntime !== localWorkerRuntime) {
        const incompatibleRuntime: string = localize('incompatibleRuntime', 'The remote runtime "{0}" for function app "{1}" does not match your local runtime "{2}".', azureWorkerRuntime, siteName, localWorkerRuntime);
        if (promptToUpdateDotnetRuntime(azureWorkerRuntime, localWorkerRuntime)) {
            const updateAndDeploy = { title: localize('updateAndDeploy', 'Update and Deploy') };
            await context.ui.showWarningMessage(
                `${incompatibleRuntime} The remote runtime version needs to be updated in order for this project to deploy successfully.`,
                { modal: true, stepName: 'incompatibleDotnetRuntime' }, updateAndDeploy);

            remoteProperties[workerRuntimeKey] = localWorkerRuntime as string;
        } else {
            throw new Error(incompatibleRuntime);
        }
    }

    if (!!rawAzureVersion && azureVersion !== localVersion) {
        const message: string = localize('incompatibleVersion', 'The remote version "{0}" for function app "{1}" does not match your local version "{2}".', rawAzureVersion, siteName, localVersion);
        const deployAnyway: vscode.MessageItem = { title: localize('deployAnyway', 'Deploy Anyway') };
        const learnMoreLink: string = 'https://aka.ms/azFuncRuntime';
        // No need to check result - cancel will throw a UserCancelledError
        await context.ui.showWarningMessage(message, { modal: true, learnMoreLink, stepName: 'incompatibleVersion' }, deployAnyway);
    }
}

/**
 * Automatically set to 1 on windows plans because it has significant perf improvements
 * https://github.com/microsoft/vscode-azurefunctions/issues/1465
 */
function verifyRunFromPackage(context: IActionContext, site: ParsedSite, remoteProperties: { [propertyName: string]: string }): boolean {
    const shouldAddSetting: boolean = !remoteProperties[runFromPackageKey];
    if (shouldAddSetting) {
        remoteProperties[runFromPackageKey] = '1';
        ext.outputChannel.appendLog(localize('addedRunFromPackage', 'Added app setting "{0}" to improve performance of function app. Learn more here: https://aka.ms/AA8vxc0', runFromPackageKey), { resourceName: site.fullName });
    }

    context.telemetry.properties.addedRunFromPackage = String(shouldAddSetting);
    return shouldAddSetting;
}

function verifyFeatureFlagSetting(context: IActionContext, site: ParsedSite, remoteProperties: { [propertyName: string]: string }): boolean {
    const featureFlagString = remoteProperties[azureWebJobsFeatureFlags] || '';

    // Feature flags are comma-delimited lists of beta features
    // https://learn.microsoft.com/en-us/azure/azure-functions/functions-app-settings#azurewebjobsfeatureflags
    const featureFlagArray = !featureFlagString ? [] : featureFlagString.split(',');
    const enableWorkerIndexingValue = 'EnableWorkerIndexing';
    const shouldAddSetting: boolean = !featureFlagArray.includes(enableWorkerIndexingValue);

    if (shouldAddSetting) {
        featureFlagArray.push(enableWorkerIndexingValue);
        ext.outputChannel.appendLog(localize('addedFeatureFlag', 'Added feature flag "{0}" because it is required for the new programming model', enableWorkerIndexingValue), { resourceName: site.fullName });
        remoteProperties[azureWebJobsFeatureFlags] = featureFlagArray.join(',');
    }

    context.telemetry.properties.addedFeatureFlagSetting = String(shouldAddSetting);
    return shouldAddSetting;
}

function verifyLinuxRemoteBuildSettings(context: IActionContext, remoteProperties: { [propertyName: string]: string }, bools: VerifyAppSettingBooleans): boolean {
    let hasChanged: boolean = false;

    const keysToRemove: string[] = [];

    if (bools.doRemoteBuild) {
        keysToRemove.push(
            'WEBSITE_RUN_FROM_ZIP',
            'WEBSITE_RUN_FROM_PACKAGE'
        );
    }

    if (!bools.isConsumption) {
        const dedicatedBuildSettings: [string, string][] = [
            ['ENABLE_ORYX_BUILD', 'true'],
            ['SCM_DO_BUILD_DURING_DEPLOYMENT', '1'],
            ['BUILD_FLAGS', 'UseExpressBuild'],
            ['XDG_CACHE_HOME', '/tmp/.cache']
        ];

        for (const [key, value] of dedicatedBuildSettings) {
            if (!bools.doRemoteBuild) {
                keysToRemove.push(key);
            } else if (remoteProperties[key] !== value) {
                remoteProperties[key] = value;
                hasChanged = true;
            }
        }
    }

    for (const key of keysToRemove) {
        if (remoteProperties[key]) {
            delete remoteProperties[key];
            hasChanged = true;
        }
    }

    context.telemetry.properties.linuxBuildSettingsChanged = String(hasChanged);
    return hasChanged;
}

// App settings are not always propagated before the deployment leading to an inconsistent behavior so verify that
async function verifyAppSettingsPropagated(context: IActionContext, client: SiteClient, expectedAppSettings: StringDictionary): Promise<void> {
    const expectedProperties = expectedAppSettings.properties || {};
    // Retry up to 2 minutes
    const retries = 12;

    return await retry(
        async (attempt: number) => {
            context.telemetry.measurements.verifyAppSettingsPropagatedAttempt = attempt;
            ext.outputChannel.appendLog(localize('verifyAppSettings', `Verifying that app settings have propagated... (Attempt ${attempt}/${retries})`), { resourceName: client.fullName });

            const currentAppSettings = await client.listApplicationSettings();
            const currentProperties = currentAppSettings.properties || {};
            // we need to check the union of the keys because we may have removed properties as well
            const keysUnion = new Set([...Object.keys(expectedProperties), ...Object.keys(currentProperties)]);

            for (const key of keysUnion) {
                if (currentProperties[key] !== expectedProperties[key]) {
                    // error gets swallowed by the end so no need for an error message
                    throw new Error();
                }
            }

            return;
        },
        { retries, minTimeout: 10 * 1000 }
    );
}
