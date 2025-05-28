/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Location } from '@azure/arm-resources-subscriptions';
import { createHttpHeaders, createPipelineRequest } from '@azure/core-rest-pipeline';
import { setLocationsTask, WebsiteOS, type IAppServiceWizardContext } from '@microsoft/vscode-azext-azureappservice';
import { createGenericClient, LocationListStep, type AzExtPipelineResponse, type AzExtRequestPrepareOptions } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { getRandomHexString } from '../../utils/fs';
import { nonNullProp } from '../../utils/nonNull';
import { type IFunctionAppWizardContext } from './IFunctionAppWizardContext';

const premiumSkuFilter = /^EP$/i;
export class FunctionAppHostingPlanStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const placeHolder: string = localize('selectHostingPlan', 'Select a hosting plan.');
        const picks: IAzureQuickPickItem<[boolean, boolean, RegExp | undefined]>[] = [
            { label: localize('flexConsumption', 'Flex Consumption'), data: [false, true, undefined] },
            { label: localize('consumption', 'Linux Consumption'), description: localize('legacy', 'Legacy'), data: [true, false, undefined] },
            { label: localize('premium', 'Premium'), data: [false, false, premiumSkuFilter] },
            { label: localize('dedicated', 'App Service Plan'), data: [false, false, /^((?!EP|Y|FC).)*$/i] }
        ];

        [context.useConsumptionPlan, context.useFlexConsumptionPlan, context.planSkuFamilyFilter] = (await context.ui.showQuickPick(picks, { placeHolder, learnMoreLink: 'aka.ms/flexconsumption' })).data;
        await setLocationsTask(context);
        if (context.useConsumptionPlan) {
            setConsumptionPlanProperties(context);
        } else if (context.useFlexConsumptionPlan) {
            setFlexConsumptionPlanProperties(context);
        }
    }

    public shouldPrompt(context: IFunctionAppWizardContext): boolean {
        return (context.useFlexConsumptionPlan === undefined && context.dockerfilePath === undefined) && !context.planSkuFamilyFilter;
    }

    public configureBeforePrompt(context: IFunctionAppWizardContext): void | Promise<void> {
        if (context.hasDurableTaskScheduler) {
            // premium is required for DTS
            if (context.advancedCreation) {
                // allows users to select/create a Elastic Premium plan
                context.planSkuFamilyFilter = premiumSkuFilter;
            } else {
                setPremiumPlanProperties(context);
            }
        } else if (context.useFlexConsumptionPlan) {
            setFlexConsumptionPlanProperties(context);
        }
    }
}

function setConsumptionPlanProperties(context: IFunctionAppWizardContext): void {
    context.newPlanName = `ASP-${nonNullProp(context, 'newSiteName')}-${getRandomHexString(4)}`;
    context.newPlanSku = { name: 'Y1', tier: 'Dynamic', size: 'Y1', family: 'Y', capacity: 0 };
}

function setFlexConsumptionPlanProperties(context: IAppServiceWizardContext): void {
    context.newPlanName = `FLEX-${nonNullProp(context, 'newSiteName')}-${getRandomHexString(4)}`;
    context.newPlanSku = { name: 'FC1', tier: 'FlexConsumption', size: 'FC', family: 'FC' };
    // flex consumption only supports linux
    context.newSiteOS = WebsiteOS.linux;
    LocationListStep.setLocationSubset(context, getFlexLocations(context), 'Microsoft.WebFlex');
}

function setPremiumPlanProperties(context: IAppServiceWizardContext): void {
    context.newPlanName = `PREMIUM-${nonNullProp(context, 'newSiteName')}-${getRandomHexString(4)}`;
    context.newPlanSku = {
        name: 'P1v2',
        tier: 'Premium V2',
        size: 'P1v2',
        family: 'Pv2'
    };
}

async function getFlexLocations(context: IAppServiceWizardContext): Promise<string[]> {
    const headers = createHttpHeaders({
        'Content-Type': 'application/json',
    });

    const options: AzExtRequestPrepareOptions = {
        url: `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Web/geoRegions?api-version=2023-01-01&sku=FlexConsumption`,
        method: 'GET',
        headers
    };

    const client = await createGenericClient(context, context);
    const result = await client.sendRequest(createPipelineRequest(options)) as AzExtPipelineResponse;
    const locations = ((result.parsedBody as { value: Location[] }).value.map(loc => loc.name) as string[])
    return locations;
}
