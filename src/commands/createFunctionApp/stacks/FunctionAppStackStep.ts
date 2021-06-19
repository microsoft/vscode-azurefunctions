/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setLocationsTask, SiteOSStep, WebsiteOS } from 'vscode-azureappservice';
import { AzureWizardPromptStep, IWizardOptions } from 'vscode-azureextensionui';
import { getMajorVersion } from '../../../FuncVersion';
import { localize } from '../../../localize';
import { IFunctionAppWizardContext } from '../IFunctionAppWizardContext';
import { getStackPicks } from './getStackPicks';

export class FunctionAppStackStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const placeHolder: string = localize('selectRuntimeStack', 'Select a runtime stack.');
        const majorVersion = getMajorVersion(context.version);
        const noPicksMessage = context.stackFilter ?
            localize('noStacksFoundWithFilter', '$(warning) No stacks found for "{0}" on Azure Functions v{1}', context.stackFilter, majorVersion) :
            localize('noStacksFound', '$(warning) No stacks found for Azure Functions v{0}', majorVersion);
        context.newSiteStack = (await context.ui.showQuickPick(getStackPicks(context), { placeHolder, enableGrouping: true, noPicksMessage })).data;

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
}
