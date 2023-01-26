/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setLocationsTask, SiteOSStep, WebsiteOS } from '@microsoft/vscode-azext-azureappservice';
import { AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { getMajorVersion, promptForFuncVersion } from '../../../FuncVersion';
import { localize } from '../../../localize';
import { FullFunctionAppStack, IFunctionAppWizardContext } from '../IFunctionAppWizardContext';
import { FunctionAppEOLWarningStep } from './FunctionAppEOLWarningStep';
import { getStackPicks, shouldShowEolWarning } from './getStackPicks';

export class FunctionAppStackStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const placeHolder: string = localize('selectRuntimeStack', 'Select a runtime stack.');

        let result: FullFunctionAppStack | undefined;
        while (true) {
            result = (await context.ui.showQuickPick(this.getPicks(context), { placeHolder, enableGrouping: true })).data;
            if (!result) {
                context.version = await promptForFuncVersion(context);
            } else {
                break;
            }
        }
        context.newSiteStack = result;

        if (!context.newSiteStack.minorVersion.stackSettings.linuxRuntimeSettings) {
            context.newSiteOS = WebsiteOS.windows;
        } else if (!context.newSiteStack.minorVersion.stackSettings.windowsRuntimeSettings) {
            context.newSiteOS = WebsiteOS.linux;
        } else if (!context.advancedCreation) {
            context.newSiteOS = <WebsiteOS>context.newSiteStack.stack.preferredOs;
        }
    }

    public shouldPrompt(context: IFunctionAppWizardContext): boolean {
        return !context.newSiteStack;
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

    private async getPicks(context: IFunctionAppWizardContext): Promise<IAzureQuickPickItem<FullFunctionAppStack | undefined>[]> {
        const picks: IAzureQuickPickItem<FullFunctionAppStack | undefined>[] = await getStackPicks(context);
        if (picks.length === 0) {
            const majorVersion = getMajorVersion(context.version);
            const noPicksMessage = context.stackFilter ?
                localize('noStacksFoundWithFilter', '$(warning) No stacks found for "{0}" on Azure Functions v{1}', context.stackFilter, majorVersion) :
                localize('noStacksFound', '$(warning) No stacks found for Azure Functions v{0}', majorVersion);
            picks.push({
                label: noPicksMessage,
                data: undefined,
                onPicked: () => {
                    // do nothing
                }
            })
        }

        picks.push({
            label: localize('changeFuncVersion', '$(gear) Change Azure Functions version'),
            description: localize('currentFuncVersion', 'Current: {0}', context.version),
            data: undefined,
            suppressPersistence: true
        });

        return picks;
    }
}
