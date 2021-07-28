/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppServicePlanListStep, IAppServiceWizardContext, setLocationsTask } from 'vscode-azureappservice';
import { AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { getRandomHexString } from '../../utils/fs';
import { nonNullProp } from '../../utils/nonNull';

export class FunctionAppHostingPlanStep extends AzureWizardPromptStep<IAppServiceWizardContext> {
    public async prompt(context: IAppServiceWizardContext): Promise<void> {
        const placeHolder: string = localize('selectHostingPlan', 'Select a hosting plan.');
        const picks: IAzureQuickPickItem<[boolean, RegExp | undefined]>[] = [
            { label: localize('consumption', 'Consumption'), data: [true, undefined] },
            { label: localize('premium', 'Premium'), data: [false, /^EP$/i] },
            { label: localize('dedicated', 'App Service Plan'), data: [false, /^((?!EP|Y).)*$/i] }
        ];

        [context.useConsumptionPlan, context.planSkuFamilyFilter] = (await context.ui.showQuickPick(picks, { placeHolder })).data;
        await setLocationsTask(context);
        if (context.useConsumptionPlan) {
            setConsumptionPlanProperties(context);
        }
    }

    public shouldPrompt(context: IAppServiceWizardContext): boolean {
        return context.useConsumptionPlan === undefined;
    }

    public async getSubWizard(_context: IAppServiceWizardContext): Promise<IWizardOptions<IAppServiceWizardContext> | undefined> {
        return { promptSteps: [new AppServicePlanListStep()] };
    }
}

export function setConsumptionPlanProperties(context: IAppServiceWizardContext): void {
    context.newPlanName = `ASP-${nonNullProp(context, 'newSiteName')}-${getRandomHexString(4)}`;
    context.newPlanSku = { name: 'Y1', tier: 'Dynamic', size: 'Y1', family: 'Y', capacity: 0 };
}
