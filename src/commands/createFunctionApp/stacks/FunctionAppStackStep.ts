/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setLocationsTask, SiteOSStep, WebsiteOS } from '@microsoft/vscode-azext-azureappservice';
import { AzureWizardPromptStep, DialogResponses, IAzureQuickPickItem, IWizardOptions, openUrl } from '@microsoft/vscode-azext-utils';
import { MessageItem } from 'vscode';
import { getMajorVersion, promptForFuncVersion } from '../../../FuncVersion';
import { localize } from '../../../localize';
import { getWorkspaceSetting, updateGlobalSetting } from '../../../vsCodeConfig/settings';
import { FullFunctionAppStack, IFunctionAppWizardContext } from '../IFunctionAppWizardContext';
import { compareDates, getStackPicks } from './getStackPicks';

export class FunctionAppStackStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const placeHolder: string = localize('selectRuntimeStack', 'Select a runtime stack.');

        let result: FullFunctionAppStack | undefined;
        while (true) {
            result = (await context.ui.showQuickPick(this.getPicks(context), { placeHolder, enableGrouping: true })).data;
            if (!result) {
                context.version = await promptForFuncVersion(context);
            } else {
                const endofLifeDate = result.minorVersion.stackSettings.linuxRuntimeSettings?.endOfLifeDate;
                const sixMonthsFromNow = new Date();
                sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
                const settingKey: string = 'endOfLifeWarning';
                if (getWorkspaceSetting<boolean>('endOfLifeWarning')) {
                    if (endofLifeDate) {
                        if (compareDates(endofLifeDate, sixMonthsFromNow)) {
                            const message = localize('endOfLife', "The chosen runtime stack has an end of support deadline coming up. After the deadline, function apps can be created and deployed, and existing apps continue to run. However, your apps won't be eligible for new features, security patches, performance optimizations, and support until you upgrade them");
                            const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true }, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
                            if (result === DialogResponses.learnMore) {
                                await openUrl('https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions?tabs=azure-cli%2Cwindows%2Cin-process%2Cv4&pivots=programming-language-csharp');
                            }
                            else if (result === DialogResponses.dontWarnAgain) {
                                await updateGlobalSetting(settingKey, false);
                            }
                        }
                    }
                }
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

    public async getSubWizard(context: IFunctionAppWizardContext): Promise<IWizardOptions<IFunctionAppWizardContext> | undefined> {
        if (context.newSiteOS === undefined) {
            return { promptSteps: [new SiteOSStep()] };
        } else {
            await setLocationsTask(context);
            return undefined;
        }
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
