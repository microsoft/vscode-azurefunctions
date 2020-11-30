/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppServicePlanListStep, IAppServiceWizardContext, setLocationsTask } from 'vscode-azureappservice';
import { AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from 'vscode-azureextensionui';
import { localize } from '../../localize';

export class FunctionAppHostingPlanStep extends AzureWizardPromptStep<IAppServiceWizardContext> {
    public async prompt(context: IAppServiceWizardContext): Promise<void> {
        const placeHolder: string = localize('selectHostingPlan', 'Select a hosting plan.');
        const picks: IAzureQuickPickItem<[boolean, RegExp | undefined]>[] = [
            { label: localize('consumption', 'Consumption'), data: [true, undefined] },
            { label: localize('premium', 'Premium'), data: [false, /^EP$/i] },
            { label: localize('dedicated', 'App Service Plan'), data: [false, /^((?!EP).)*$/i] }
        ];

        [context.useConsumptionPlan, context.planSkuFamilyFilter] = (await context.ui.showQuickPick(picks, { placeHolder })).data;
        await setLocationsTask(context);
    }

    public shouldPrompt(context: IAppServiceWizardContext): boolean {
        return context.useConsumptionPlan === undefined;
    }

    public async getSubWizard(context: IAppServiceWizardContext): Promise<IWizardOptions<IAppServiceWizardContext> | undefined> {
        if (!context.useConsumptionPlan) {
            return { promptSteps: [new AppServicePlanListStep()] };
        } else {
            return undefined;
        }
    }
}
