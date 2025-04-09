/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type StringDictionary } from '@azure/arm-appservice';
import { type ServiceClient } from '@azure/core-client';
import { createPipelineRequest } from '@azure/core-rest-pipeline';
import { type SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { type IAppSettingsClient } from '@microsoft/vscode-azext-azureappsettings';
import { createGenericClient, LocationListStep, type AzExtPipelineResponse } from '@microsoft/vscode-azext-azureutils';
import { maskUserInfo, nonNullValue, openUrl, parseError, type AgentQuickPickItem, type AzExtParentTreeItem, type IAzureQuickPickItem, type ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { hiddenStacksSetting, noRuntimeStacksAvailableLabel, stackUpgradeLearnMoreLink } from '../../../constants';
import { previewDescription } from '../../../constants-nls';
import { funcVersionLink } from '../../../FuncVersion';
import { localize } from '../../../localize';
import { isResolvedFunctionApp } from '../../../tree/ResolvedFunctionAppResource';
import { requestUtils } from '../../../utils/requestUtils';
import { getWorkspaceSetting } from '../../../vsCodeConfig/settings';
import { type FullFunctionAppStack, type IFunctionAppWizardContext } from '../IFunctionAppWizardContext';
import { backupStacks } from './backupStacks';
import { type AppStackMinorVersion } from './models/AppStackModel';
import { type FunctionAppRuntimes, type FunctionAppStack } from './models/FunctionAppStackModel';

export async function getStackPicks(context: IFunctionAppWizardContext, isFlex: boolean): Promise<AgentQuickPickItem<IAzureQuickPickItem<FullFunctionAppStack | undefined>>[]> {
    const stacks: FunctionAppStack[] = isFlex ?
        (await getFlexStacks(context)).filter(s => !context.stackFilter || context.stackFilter === s.value) :
        (await getStacks(context)).filter(s => !context.stackFilter || context.stackFilter === s.value);
    const picks: AgentQuickPickItem<IAzureQuickPickItem<FullFunctionAppStack | undefined>>[] = [];
    let hasEndOfLife = false;
    let stackHasPicks: boolean;

    for (const stack of stacks) {
        stackHasPicks = false;
        for (const majorVersion of stack.majorVersions) {
            const minorVersions: (AppStackMinorVersion<FunctionAppRuntimes>)[] = majorVersion.minorVersions
                .filter(mv => {
                    return (mv.stackSettings.linuxRuntimeSettings && mv.stackSettings.linuxRuntimeSettings.supportedFunctionsExtensionVersions.includes(context.version)) ||
                        (mv.stackSettings.windowsRuntimeSettings && mv.stackSettings.windowsRuntimeSettings.supportedFunctionsExtensionVersions.includes(context.version));
                });

            for (const minorVersion of minorVersions) {
                let description: string | undefined;
                const previewOs = getFlagOs(minorVersion.stackSettings, 'isPreview');
                switch (previewOs) {
                    case 'All':
                        description = previewDescription;
                        break;
                    case 'Linux':
                    case 'Windows':
                        description = localize('previewOnOS', '(Preview on {0})', previewOs);
                        break;
                }

                const earlyAccessOS = getFlagOs(minorVersion.stackSettings, 'isEarlyAccess');
                switch (earlyAccessOS) {
                    case 'All':
                        description = localize('earlyAccess', '(Early Access)');
                        break;
                    case 'Linux':
                    case 'Windows':
                        description = localize('earlyAccessOnOS', '(Early Access on {0})', earlyAccessOS);
                        break;
                }

                const deprecatedOS = getFlagOs(minorVersion.stackSettings, 'isDeprecated');
                switch (deprecatedOS) {
                    case 'All':
                        description = localize('deprecated', '(Deprecated)');
                        break;
                    case 'Linux':
                    case 'Windows':
                        description = localize('deprecatedOnOS', '(Deprecated on {0})', deprecatedOS);
                        break;
                }

                if (shouldShowEolWarning(minorVersion)) {
                    description = localize('endOfLife', `$(extensions-warning-message)`)
                    hasEndOfLife = true;
                }

                picks.push({
                    label: minorVersion.displayText,
                    description,
                    group: stack.displayText,
                    data: { stack, majorVersion, minorVersion },
                    agentMetadata: {}
                });
                stackHasPicks = true;
            }
        }

        if (!stackHasPicks) {
            picks.push({
                label: noRuntimeStacksAvailableLabel,
                group: stack.displayText,
                data: undefined,
                agentMetadata: { notApplicableToAgentPick: true }
            });
        }
    }

    picks.sort((p1, p2) => {
        if (!p1.data || !p2.data) {
            return 0;
        }

        return p1.data.stack.value !== p2.data.stack.value ?
            0 : // keep order as-is if they're different stacks (i.e. Node.js vs. .NET)
            getPriority(p1.data.minorVersion.stackSettings) - getPriority(p2.data.minorVersion.stackSettings); // otherwise sort based on priority
    });
    if (hasEndOfLife) {
        picks.push({
            label: localize('endOfLife', `$(extensions-warning-message) Some stacks have an end of support deadline coming up. Learn more...`),
            onPicked: async () => {
                await openUrl(funcVersionLink);
            },
            data: undefined,
            agentMetadata: { notApplicableToAgentPick: true }
        });
    }
    return picks;
}

type FlagOS = 'All' | 'Linux' | 'Windows' | 'None';
function getFlagOs(ss: FunctionAppRuntimes, key: 'isHidden' | 'isDefault' | 'isPreview' | 'isEarlyAccess' | 'isDeprecated'): FlagOS {
    if ([ss.linuxRuntimeSettings, ss.windowsRuntimeSettings].every(s => !s || s[key])) {
        // NOTE: 'All' means all OS's _that are defined_ have the flag set. This may only be one OS if that's all that is defined/supported by this stack
        return 'All';
    } else if (ss.linuxRuntimeSettings?.[key]) {
        return 'Linux';
    } else if (ss.windowsRuntimeSettings?.[key]) {
        return 'Windows';
    } else {
        return 'None';
    }
}

function getPriority(ss: FunctionAppRuntimes): number {
    if (getFlagOs(ss, 'isDefault') !== 'None') {
        return 1;
    } else if (getFlagOs(ss, 'isEarlyAccess') === 'All') {
        return 3;
    } else if (getFlagOs(ss, 'isPreview') === 'All') {
        return 4;
    } else if (getFlagOs(ss, 'isHidden') === 'All') {
        return 5;
    } else if (getFlagOs(ss, 'isDeprecated') === 'All') {
        return 6;
    } else {
        return 2;
    }
}

type StacksArmResponse = { value: { properties: FunctionAppStack }[] };
async function getStacks(context: ISubscriptionActionContext & { _stacks?: FunctionAppStack[] }): Promise<FunctionAppStack[]> {
    if (!context._stacks) {
        let stacksArmResponse: StacksArmResponse;
        try {
            const client: ServiceClient = await createGenericClient(context, context);
            const result: AzExtPipelineResponse = await client.sendRequest(createPipelineRequest({
                method: 'GET',
                url: requestUtils.createRequestUrl('/providers/Microsoft.Web/functionappstacks', {
                    'api-version': '2020-10-01',
                    removeDeprecatedStacks: String(!getWorkspaceSetting<boolean>('showDeprecatedStacks'))
                }),
            }));
            stacksArmResponse = <StacksArmResponse>result.parsedBody;
        } catch (error) {
            // Some environments (like Azure Germany/Mooncake) don't support the stacks ARM API yet
            // And since the stacks don't change _that_ often, we'll just use a backup hard-coded value
            stacksArmResponse = <StacksArmResponse>JSON.parse(backupStacks);
            context.telemetry.properties.getStacksError = maskUserInfo(parseError(error).message, []);
        }

        context._stacks = stacksArmResponse.value.map(d => d.properties);

        removeDeprecatedStacks(context._stacks);
        removeHiddenStacksAndProperties(context._stacks);
    }

    return context._stacks;
}

async function getFlexStacks(context: ISubscriptionActionContext & { _stacks?: FunctionAppStack[] }, location?: string): Promise<FunctionAppStack[]> {
    const client: ServiceClient = await createGenericClient(context, context);
    location = location ?? (await LocationListStep.getLocation(context)).name;
    const flexFunctionAppStacks: FunctionAppStack[] = [];
    const stacks = ['dotnet', 'java', 'node', 'powershell', 'python'];
    if (!context._stacks) {
        const getFlexStack = async (stack: string) => {
            const result: AzExtPipelineResponse = await client.sendRequest(createPipelineRequest({
                method: 'GET',
                url: requestUtils.createRequestUrl(`providers/Microsoft.Web/locations/${location}/functionAppStacks`, {
                    'api-version': '2023-12-01',
                    stack,
                    removeDeprecatedStacks: String(!getWorkspaceSetting<boolean>('showDeprecatedStacks'))
                }),
            }));
            const stacksArmResponse = <StacksArmResponse>result.parsedBody;
            for (const stack of stacksArmResponse.value) {
                stack.properties.majorVersions = stack.properties.majorVersions.filter(mv => {
                    mv.minorVersions = mv.minorVersions.filter(minor => {
                        // Remove stacks that don't have a SKU
                        return minor.stackSettings.linuxRuntimeSettings && minor.stackSettings.linuxRuntimeSettings?.Sku !== null;

                    });

                    return mv.minorVersions.length > 0;
                });
            }
            flexFunctionAppStacks.push(...stacksArmResponse.value.map(d => d.properties));
        }

        for (const stack of stacks) {
            await getFlexStack(stack);
        }

        context._stacks = flexFunctionAppStacks;
    }

    return context._stacks;
}

// API is still showing certain deprecated stacks even when 'removeDeprecatedStacks' queryParameter is set to true.
// We should filter them out manually just in case.
function removeDeprecatedStacks(stacks: FunctionAppStack[]) {
    if (getWorkspaceSetting<boolean>('showDeprecatedStacks')) {
        return;
    }

    const deprecatedDotnetStacks: string[] = ['dotnetcore2', 'dotnetcore3.1', 'dotnet5'];
    for (const stack of stacks) {
        if (stack.value === 'dotnet') {
            stack.majorVersions = stack.majorVersions.filter(mv => !deprecatedDotnetStacks.includes(mv.value));
        }
    }
}


function removeHiddenStacksAndProperties(stacks: FunctionAppStack[]): void {
    const showHiddenStacks = getWorkspaceSetting<boolean>(hiddenStacksSetting);
    for (const stack of stacks) {
        for (const major of stack.majorVersions) {
            for (const minor of major.minorVersions) {
                // Temporary workaround because the platform team doesn't want .NET 5 to show in the portal yet, but they do want it in VS Code
                // https://github.com/microsoft/vscode-azurefunctions/issues/2552
                if (major.value === 'dotnet5') {
                    if (minor.stackSettings.linuxRuntimeSettings) {
                        minor.stackSettings.linuxRuntimeSettings.isHidden = false;
                    }
                    if (minor.stackSettings.windowsRuntimeSettings) {
                        minor.stackSettings.windowsRuntimeSettings.isHidden = false;
                    }
                }

                if (!showHiddenStacks) {
                    if (minor.stackSettings.linuxRuntimeSettings?.isHidden) {
                        delete minor.stackSettings.linuxRuntimeSettings;
                    }

                    if (minor.stackSettings.windowsRuntimeSettings?.isHidden) {
                        delete minor.stackSettings.windowsRuntimeSettings;
                    }
                }
            }
        }
    }
}

export function shouldShowEolWarning(minorVersion?: AppStackMinorVersion<FunctionAppRuntimes>): boolean {
    const endOfLifeDate = minorVersion?.stackSettings.linuxRuntimeSettings?.endOfLifeDate;
    if (endOfLifeDate) {
        const endOfLife = new Date(endOfLifeDate);
        const sixMonthsFromNow = new Date(new Date().setMonth(new Date().getMonth() + 6));
        return endOfLife <= sixMonthsFromNow;
    }
    return false
}

export interface eolWarningOptions {
    site: Site;
    isLinux?: boolean;
    isFlex?: boolean;
    client?: SiteClient | IAppSettingsClient;
    location?: string;
    version?: string;
    runtime?: string
}
/**
 * This function checks the end of life date for stack and returns a message if the stack is end of life or will be end of life in 6 months.
 */
export async function getEolWarningMessages(context: ISubscriptionActionContext, options: eolWarningOptions): Promise<string> {
    let isEOL = false;
    let willBeEOL = false;
    let version: string | undefined;
    let displayInfo: {
        endOfLife: Date | undefined;
        displayVersion: string | undefined;
    } = { endOfLife: undefined, displayVersion: undefined };

    if (options.isFlex) {
        const runtime = options.site.functionAppConfig?.runtime?.name;
        version = options.site.functionAppConfig?.runtime?.version;
        displayInfo = (await getEOLDate(context, {
            site: options.site,
            version: nonNullValue(version),
            runtime: nonNullValue(runtime) === 'dotnet-isolated' ? 'dotnet' : nonNullValue(runtime),
            isFlex: true,
            location: options.site.location
        })
        );
    } else if (options.isLinux) {
        const linuxFxVersion = options.site.siteConfig?.linuxFxVersion;
        displayInfo = await getEOLLinuxFxVersion(context, nonNullValue(linuxFxVersion));
    } else if (options.site.siteConfig) {
        if (options.site.siteConfig.javaVersion) {
            displayInfo = (await getEOLDate(context, {
                site: options.site,
                version: options.site.siteConfig.javaVersion,
                runtime: 'java'
            }));
        } else if (options.site.siteConfig.powerShellVersion) {
            displayInfo = (await getEOLDate(context, {
                site: options.site,
                version: options.site.siteConfig.powerShellVersion,
                runtime: 'powershell'
            }));
        } else if (options.site.siteConfig.netFrameworkVersion) {
            // In order to get the node version, we need to check the app settings
            let appSettings: StringDictionary | undefined;
            if (options.client) {
                appSettings = await options.client.listApplicationSettings();
            }
            if (appSettings && appSettings.properties && appSettings.properties['WEBSITE_NODE_DEFAULT_VERSION']) {
                displayInfo = (await getEOLDate(context, {
                    site: options.site,
                    version: appSettings.properties['WEBSITE_NODE_DEFAULT_VERSION'],
                    runtime: 'node'
                }));
            } else {
                displayInfo = (await getEOLDate(context, {
                    site: options.site,
                    version: options.site.siteConfig.netFrameworkVersion,
                    runtime: 'dotnet'
                }));
            }
        }
    }

    if (displayInfo.endOfLife) {
        const sixMonthsFromNow = new Date(new Date().setMonth(new Date().getMonth() + 6));
        isEOL = displayInfo.endOfLife <= new Date();
        willBeEOL = displayInfo.endOfLife <= sixMonthsFromNow;
        if (isEOL) {
            return localize('eolWarning', 'Upgrade to the latest available version as version {0} has reached end-of-life on {1} and is no longer supported.', displayInfo.displayVersion, displayInfo.endOfLife.toLocaleDateString());
        } else if (willBeEOL) {
            return localize('willBeEolWarning', 'Upgrade to the latest available version as version {0} will reach end-of-life on {1} and will no longer be supported.', displayInfo.displayVersion, displayInfo.endOfLife.toLocaleDateString());
        }
    }

    return '';
}

export async function showEolWarningIfNecessary(context: ISubscriptionActionContext, parent: AzExtParentTreeItem, client?: IAppSettingsClient) {
    if (isResolvedFunctionApp(parent)) {
        client = client ?? await parent.site.createClient(context);
        const eolWarningMessage = await getEolWarningMessages(context, {
            site: parent.site.rawSite,
            isLinux: client.isLinux,
            isFlex: parent.isFlex,
            client
        });
        if (eolWarningMessage) {
            const continueOn: MessageItem = { title: localize('continueOn', 'Continue') };
            await context.ui.showWarningMessage(eolWarningMessage, { modal: true, learnMoreLink: stackUpgradeLearnMoreLink }, continueOn);
        }
    }
}

async function getEOLDate(context: ISubscriptionActionContext, options: eolWarningOptions): Promise<{ endOfLife: Date | undefined, displayVersion: string }> {
    try {
        const stacks = options.isFlex ?
            (await getFlexStacks(context, options.location)).filter(s => options.runtime === s.value) :
            (await getStacks(context)).filter(s => options.runtime === s.value);
        const versionFilteredStacks = stacks[0].majorVersions.filter(mv => mv.minorVersions.some(minor => options.isFlex ? minor.stackSettings.linuxRuntimeSettings?.runtimeVersion : minor.stackSettings.windowsRuntimeSettings?.runtimeVersion === options.version));
        const filteredStack = versionFilteredStacks[0].minorVersions.find(minor => options.isFlex ? minor.stackSettings.linuxRuntimeSettings?.runtimeVersion : minor.stackSettings.windowsRuntimeSettings?.runtimeVersion === options.version);
        const displayVersion = nonNullValue(filteredStack?.displayText);
        const endOfLifeDate = options.isFlex ?
            filteredStack?.stackSettings.linuxRuntimeSettings?.endOfLifeDate :
            filteredStack?.stackSettings.windowsRuntimeSettings?.endOfLifeDate;
        if (endOfLifeDate) {
            const endOfLife = new Date(endOfLifeDate)
            return {
                endOfLife,
                displayVersion
            }
        }
        return {
            endOfLife: undefined,
            displayVersion
        }
    } catch {
        return {
            endOfLife: undefined,
            displayVersion: ''
        }
    }
}

async function getEOLLinuxFxVersion(context: ISubscriptionActionContext, linuxFxVersion: string): Promise<{ endOfLife: Date | undefined, displayVersion: string }> {
    try {
        const stacks = (await getStacks(context)).filter(s =>
            s.majorVersions.some(mv =>
                mv.minorVersions.some(minor => minor.stackSettings.linuxRuntimeSettings?.runtimeVersion === linuxFxVersion)
            )
        );
        const versionFilteredStacks = stacks[0].majorVersions.filter(mv => mv.minorVersions.some(minor => minor.stackSettings.linuxRuntimeSettings?.runtimeVersion === linuxFxVersion));
        const filteredStack = versionFilteredStacks[0].minorVersions.find(minor => minor.stackSettings.linuxRuntimeSettings?.runtimeVersion === linuxFxVersion);
        const displayVersion = filteredStack?.displayText ?? localize('unknownVersion', 'Unknown version');
        const endOfLifeDate = filteredStack?.stackSettings.linuxRuntimeSettings?.endOfLifeDate;
        if (endOfLifeDate) {
            const endOfLife = new Date(endOfLifeDate)
            return {
                endOfLife,
                displayVersion
            }
        }
        return {
            endOfLife: undefined,
            displayVersion
        }
    } catch {
        return {
            endOfLife: undefined,
            displayVersion: ''
        }
    }
}
