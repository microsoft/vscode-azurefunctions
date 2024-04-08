/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setLocationsTask, SiteOSStep, WebsiteOS } from '@microsoft/vscode-azext-azureappservice';
import { AzureWizardPromptStep, openUrl, type AgentQuickPickItem, type AgentQuickPickOptions, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { noRuntimeStacksAvailableLabel } from '../../../constants';
import { getMajorVersion, promptForFuncVersion } from '../../../FuncVersion';
import { localize } from '../../../localize';
import { type FullFunctionAppStack, type IFunctionAppWizardContext } from '../IFunctionAppWizardContext';
import { FunctionAppEOLWarningStep } from './FunctionAppEOLWarningStep';
import { getStackPicks, shouldShowEolWarning } from './getStackPicks';

export class FunctionAppStackStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const placeHolder: string = localize('selectRuntimeStack', 'Select a runtime stack.');
        const isFlex: boolean = context.newPlanSku?.tier === 'FlexConsumption';

        // TODO: Since we aren't able to get the stacks for flex, we're using a simple object to represent the stack but we should when available
        let result: FullFunctionAppStack | { runtime: string, version: string } | undefined;
        while (true) {
            const options: AgentQuickPickOptions = {
                placeHolder,
                enableGrouping: true,
                agentMetadata: {
                    parameterDisplayTitle: 'Runtime Stack',
                    parameterDisplayDescription: 'The runtime stack to use for the function app.'
                }
            };

            const picks = await this.getPicks(context, isFlex);
            result = (await context.ui.showQuickPick(picks, options)).data;
            if (!result) {
                context.version = await promptForFuncVersion(context);
            } else {
                break;
            }
        }
        if (isFlex) {
            context.newSiteStackFlex = result as { runtime: string, version: string };
        } else {
            context.newSiteStack = result as FullFunctionAppStack;

            if (!context.newSiteStack.minorVersion.stackSettings.linuxRuntimeSettings) {
                context.newSiteOS = WebsiteOS.windows;
            } else if (!context.newSiteStack.minorVersion.stackSettings.windowsRuntimeSettings) {
                context.newSiteOS = WebsiteOS.linux;
            } else if (!context.advancedCreation) {
                context.newSiteOS = <WebsiteOS>context.newSiteStack.stack.preferredOs;
            }
        }
    }

    public shouldPrompt(context: IFunctionAppWizardContext): boolean {
        return !context.newSiteStack && !context.newSiteStackFlex;
    }

    public async getSubWizard(context: IFunctionAppWizardContext): Promise<IWizardOptions<IFunctionAppWizardContext>> {
        const promptSteps: AzureWizardPromptStep<IFunctionAppWizardContext>[] = [];
        if (shouldShowEolWarning(context.newSiteStack?.minorVersion)) {
            promptSteps.push(new FunctionAppEOLWarningStep());
        }
        if (context.newSiteOS === undefined) {
            promptSteps.push(new SiteOSStep())
        } else {
            await setLocationsTask(context);
        }
        return { promptSteps };
    }

    private async getPicks(context: IFunctionAppWizardContext, isFlex: boolean): Promise<AgentQuickPickItem<IAzureQuickPickItem<FullFunctionAppStack | { runtime: string, version: string } | undefined>>[]> {
        // TODO: hardcoding the runtime versions for now, but we should get this from the API when available
        if (isFlex) {
            return [
                {
                    label: '.NET 8 Isolated',
                    data: {
                        runtime: 'dotnet-isolated',
                        version: '8'
                    },
                    group: '.NET',
                    agentMetadata: {}
                },
                {
                    label: 'Java 17',
                    data: {
                        runtime: 'java',
                        version: '17'
                    },
                    group: 'Java',
                    agentMetadata: {}
                },
                {
                    label: 'Java 11',
                    data: {
                        runtime: 'java',
                        version: '11'
                    },
                    group: 'Java',
                    agentMetadata: {}
                },
                {
                    label: "Node.js 20 LTS",
                    data: {
                        runtime: 'node',
                        version: '20'
                    },
                    group: 'Node.js',
                    agentMetadata: {}
                },
                {
                    label: 'Python 3.11',
                    data: {
                        runtime: 'python',
                        version: '3.11'
                    },
                    group: 'Python',
                    agentMetadata: {}
                },
                {
                    label: 'Python 3.10',
                    data: {
                        runtime: 'python',
                        version: '3.10'
                    },
                    group: 'Python',
                    agentMetadata: {}
                },
                {
                    label: 'PowerShell',
                    data: {
                        runtime: 'powershell',
                        version: '7.2'
                    },
                    group: 'PowerShell Core',
                    agentMetadata: {}
                }
            ];
        }
        let picks: AgentQuickPickItem<IAzureQuickPickItem<FullFunctionAppStack | undefined>>[] = await getStackPicks(context);
        if (picks.filter(p => p.label !== noRuntimeStacksAvailableLabel).length === 0) {
            // if every runtime only has noRuntimeStackAvailable quickpick items, reset picks to []
            picks = [];
        }

        const majorVersion = getMajorVersion(context.version);
        const isEol = Number(majorVersion) === 2 || Number(majorVersion) === 3;
        if (picks.length === 0) {
            const noPicksMessage = context.stackFilter ?
                localize('noStacksFoundWithFilter', '$(warning) No stacks found for "{0}" on Azure Functions v{1}', context.stackFilter, majorVersion) :
                localize('noStacksFound', '$(warning) No stacks found for Azure Functions v{0}', majorVersion);
            const upgradeMessage = localize('eolWarning', '$(warning) No stacks found for Azure Functions v{0} due to being EOL. Learn how to upgrade to V4...', majorVersion)
            picks.push({
                label: isEol ? upgradeMessage : noPicksMessage,
                data: undefined,
                onPicked: async () => {
                    await openUrl('https://aka.ms/function-runtime-host-warning');
                },
                agentMetadata: { notApplicableToAgentPick: true }
            })
        }

        picks.push({
            label: localize('changeFuncVersion', '$(gear) Change Azure Functions version'),
            description: localize('currentFuncVersion', 'Current: {0}', context.version) + (isEol ? ' $(warning)' : ''),
            data: undefined,
            suppressPersistence: true,
            agentMetadata: { notApplicableToAgentPick: true }
        });

        return picks;
    }
}
