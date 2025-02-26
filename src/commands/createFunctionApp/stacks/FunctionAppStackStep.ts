/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setLocationsTask, SiteOSStep, WebsiteOS } from '@microsoft/vscode-azext-azureappservice';
import { AzureWizardPromptStep, openUrl, type AgentQuickPickItem, type AgentQuickPickOptions, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { noRuntimeStacksAvailableLabel } from '../../../constants';
import { getMajorVersion, promptForFuncVersion } from '../../../FuncVersion';
import { localize } from '../../../localize';
import { InstanceMemoryMBPromptStep } from '../flex/InstanceMemoryMBPromptStep';
import { MaximumInstanceCountPromptStep } from '../flex/MaximumInstanceCountPromptStep';
import { type FullFunctionAppStack, type IFlexFunctionAppWizardContext } from '../IFunctionAppWizardContext';
import { FunctionAppEOLWarningStep } from './FunctionAppEOLWarningStep';
import { getStackPicks, shouldShowEolWarning } from './getStackPicks';

export class FunctionAppStackStep extends AzureWizardPromptStep<IFlexFunctionAppWizardContext> {
    public async prompt(context: IFlexFunctionAppWizardContext): Promise<void> {
        const placeHolder: string = localize('selectRuntimeStack', 'Select a runtime stack.');
        const isFlex: boolean = context.newPlanSku?.tier === 'FlexConsumption';
        let result: FullFunctionAppStack | undefined;
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

        context.newSiteStack = result as FullFunctionAppStack;
        if (!context.newSiteOS) {
            if (!context.newSiteStack.minorVersion.stackSettings.linuxRuntimeSettings) {
                context.newSiteOS = WebsiteOS.windows;
            } else if (!context.newSiteStack.minorVersion.stackSettings.windowsRuntimeSettings) {
                context.newSiteOS = WebsiteOS.linux;
            } else if (!context.advancedCreation) {
                context.newSiteOS = <WebsiteOS>context.newSiteStack.stack.preferredOs;
            }
        }

        if (isFlex) {
            context.newFlexSku = result.minorVersion.stackSettings.linuxRuntimeSettings?.Sku && result.minorVersion.stackSettings.linuxRuntimeSettings?.Sku[0];
        }
    }

    public shouldPrompt(context: IFlexFunctionAppWizardContext): boolean {
        return !context.newSiteStack;
    }

    public async getSubWizard(context: IFlexFunctionAppWizardContext): Promise<IWizardOptions<IFlexFunctionAppWizardContext>> {
        const promptSteps: AzureWizardPromptStep<IFlexFunctionAppWizardContext>[] = [];
        if (shouldShowEolWarning(context.newSiteStack?.minorVersion)) {
            promptSteps.push(new FunctionAppEOLWarningStep());
        }
        if (context.newSiteOS === undefined) {
            promptSteps.push(new SiteOSStep())
        } else {
            await setLocationsTask(context);
        }

        if (context.newFlexSku) {
            promptSteps.push(new InstanceMemoryMBPromptStep(), new MaximumInstanceCountPromptStep());
        }

        return { promptSteps };
    }

    private async getPicks(context: IFlexFunctionAppWizardContext, isFlex: boolean): Promise<AgentQuickPickItem<IAzureQuickPickItem<FullFunctionAppStack | undefined>>[]> {
        let picks: AgentQuickPickItem<IAzureQuickPickItem<FullFunctionAppStack | undefined>>[] = await getStackPicks(context, isFlex);
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
