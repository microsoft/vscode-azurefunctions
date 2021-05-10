/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, ServiceClient } from '@azure/ms-rest-js';
import { createGenericClient, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { hiddenStacksSetting } from '../../../constants';
import { localize } from '../../../localize';
import { getWorkspaceSetting } from '../../../vsCodeConfig/settings';
import { FullFunctionAppStack, IFunctionAppWizardContext } from '../IFunctionAppWizardContext';
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
                if (isFlagSet(minorVersion.stackSettings, 'isPreview')) {
                    description = localize('preview', '(Preview)');
                } else if (isFlagSet(minorVersion.stackSettings, 'isEarlyAccess')) {
                    description = localize('earlyAccess', '(Early Access)');
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

function isFlagSet(ss: FunctionAppRuntimes, key: 'isHidden' | 'isDefault' | 'isPreview' | 'isEarlyAccess'): boolean {
    return !![ss.linuxRuntimeSettings, ss.windowsRuntimeSettings].find(s => s && s[key]);
}

function getPriority(ss: FunctionAppRuntimes): number {
    if (isFlagSet(ss, 'isDefault')) {
        return 1;
    } else if (isFlagSet(ss, 'isEarlyAccess')) {
        return 3;
    } else if (isFlagSet(ss, 'isPreview')) {
        return 4;
    } else if (isFlagSet(ss, 'isHidden')) {
        return 5;
    } else {
        return 2;
    }
}

async function getStacks(context: IFunctionAppWizardContext & { _stacks?: FunctionAppStack[] }): Promise<FunctionAppStack[]> {
    if (!context._stacks) {
        const client: ServiceClient = await createGenericClient();
        const result: HttpOperationResponse = await client.sendRequest({
            method: 'GET',
            url: 'https://aka.ms/AAa5ia0',
            queryParameters: {
                'api-version': '2020-10-01',
                removeDeprecatedStacks: 'true'
            }
        });
        context._stacks = <FunctionAppStack[]>result.parsedBody;

        removeHiddenStacks(context._stacks);
    }

    return context._stacks;
}


function removeHiddenStacks(stacks: FunctionAppStack[]): void {
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
