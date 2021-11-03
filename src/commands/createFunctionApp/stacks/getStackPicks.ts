/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, ServiceClient } from '@azure/ms-rest-js';
import { createGenericClient, IAzureQuickPickItem, parseError } from 'vscode-azureextensionui';
import { hiddenStacksSetting } from '../../../constants';
import { FuncVersion } from '../../../FuncVersion';
import { localize } from '../../../localize';
import { getWorkspaceSetting } from '../../../vsCodeConfig/settings';
import { FullFunctionAppStack, IFunctionAppWizardContext } from '../IFunctionAppWizardContext';
import { backupStacks } from './backupStacks';
import { AppStackMinorVersion } from './models/AppStackModel';
import { FunctionAppRuntimes, FunctionAppStack } from './models/FunctionAppStackModel';

export async function getStackPicks(context: IFunctionAppWizardContext): Promise<IAzureQuickPickItem<FullFunctionAppStack>[]> {
    const stacks: FunctionAppStack[] = (await getStacks(context)).filter(s => !context.stackFilter || context.stackFilter === s.value);
    const picks: IAzureQuickPickItem<FullFunctionAppStack>[] = [];
    for (const stack of stacks) {
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
                        description = localize('preview', '(Preview)');
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

                picks.push({
                    label: minorVersion.displayText,
                    description,
                    group: stack.displayText,
                    data: { stack, majorVersion, minorVersion }
                });
            }
        }
    }

    return picks.sort((p1, p2) => {
        return p1.data.stack.value !== p2.data.stack.value ?
            0 : // keep order as-is if they're different stacks (i.e. Node.js vs. .NET)
            getPriority(p1.data.minorVersion.stackSettings) - getPriority(p2.data.minorVersion.stackSettings); // otherwise sort based on priority
    });
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
async function getStacks(context: IFunctionAppWizardContext & { _stacks?: FunctionAppStack[] }): Promise<FunctionAppStack[]> {
    if (!context._stacks) {
        let stacksArmResponse: StacksArmResponse;
        try {
            const client: ServiceClient = await createGenericClient(context, context);
            const result: HttpOperationResponse = await client.sendRequest({
                baseUrl: 'https://functions-release.azure.com',
                method: 'GET',
                pathTemplate: '/stacks/functionappstacks',
                queryParameters: {
                    'api-version': '2020-10-01',
                    removeDeprecatedStacks: String(!getWorkspaceSetting<boolean>('showDeprecatedStacks')),
                    removeHiddenStacks: true,
                    removeDepcrecatedStacks: true
                }
            });
            stacksArmResponse = <StacksArmResponse>result.parsedBody;
        } catch (error) {
            // Some environments (like Azure Germany/Mooncake) don't support the stacks ARM API yet
            // And since the stacks don't change _that_ often, we'll just use a backup hard-coded value
            stacksArmResponse = <StacksArmResponse>JSON.parse(backupStacks);
            context.telemetry.properties.getStacksError = parseError(error).message;
        }

        context._stacks = stacksArmResponse.value.map(d => d.properties);

        removeHiddenStacksAndProperties(context._stacks);
    }

    return context._stacks;
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

                if (minor.stackSettings.windowsRuntimeSettings?.supportedFunctionsExtensionVersions.includes(FuncVersion.v3) &&
                    minor.stackSettings.windowsRuntimeSettings?.supportedFunctionsExtensionVersions.includes(FuncVersion.v4)) {
                    // Temporary workaround becausecurrently there are stacks that support both v3 and v4, but if netFrameworkVersion v6.0
                    // is set for ~3 app, it will break so delete the netFrameworkVersion and only set to v6.0 for ~4
                    // https://github.com/microsoft/vscode-azurefunctions/issues/2990
                    delete minor.stackSettings.windowsRuntimeSettings.siteConfigPropertiesDictionary.netFrameworkVersion;
                }
            }
        }
    }
}
