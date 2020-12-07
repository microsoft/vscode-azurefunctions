/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, ServiceClient } from '@azure/ms-rest-js';
import { createGenericClient, IAzureQuickPickItem } from 'vscode-azureextensionui';
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
                    data: { stack, majorVersion, minorVersion }
                });
            }
        }
    }

    return picks;
}

function isFlagSet(ss: FunctionAppRuntimes, key: 'isPreview' | 'isEarlyAccess'): boolean {
    return !![ss.linuxRuntimeSettings, ss.windowsRuntimeSettings].find(s => s && s[key]);
}

async function getStacks(context: IFunctionAppWizardContext & { _stacks?: FunctionAppStack[] }): Promise<FunctionAppStack[]> {
    if (!context._stacks) {
        const client: ServiceClient = await createGenericClient();
        const result: HttpOperationResponse = await client.sendRequest({
            method: 'GET',
            url: 'https://aka.ms/AAa5ia0',
            queryParameters: {
                'api-version': '2020-10-01',
                removeHiddenStacks: String(!getWorkspaceSetting<boolean>('showHiddenStacks')),
                removeDeprecatedStacks: 'true'
            }
        });
        context._stacks = <FunctionAppStack[]>result.parsedBody;
    }

    return context._stacks;
}
