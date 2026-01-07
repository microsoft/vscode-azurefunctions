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

export enum FunctionAppHostingPlans {
    Flex,
    Consumption,
    Premium,
    AppService,
}

export const allAvailableFunctionAppHostingPlans = new Set([FunctionAppHostingPlans.Flex, FunctionAppHostingPlans.Consumption, FunctionAppHostingPlans.Premium, FunctionAppHostingPlans.AppService]);

export class FunctionAppHostingPlanStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    constructor(private readonly availablePlans: Set<FunctionAppHostingPlans>) {
        super();
    }

    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<[boolean, boolean, RegExp | undefined]>[] = [];
        if (this.availablePlans.has(FunctionAppHostingPlans.Flex)) {
            picks.push({ label: localize('flexConsumption', 'Flex Consumption'), data: [false, true, undefined] });
        }
        if (this.availablePlans.has(FunctionAppHostingPlans.Consumption)) {
            picks.push({ label: localize('consumption', 'Consumption'), description: localize('legacy', 'Legacy'), data: [true, false, undefined] });
        }
        if (this.availablePlans.has(FunctionAppHostingPlans.Premium)) {
            picks.push({ label: localize('premium', 'Premium'), data: [false, false, /^EP$/i] });
        }
        if (this.availablePlans.has(FunctionAppHostingPlans.AppService)) {
            picks.push({ label: localize('dedicated', 'App Service Plan'), data: [false, false, /^((?!EP|Y|FC).)*$/i] });
        }

        const placeHolder: string = localize('selectHostingPlan', 'Select a hosting plan.');
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
        if (context.useFlexConsumptionPlan) {
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

async function getFlexLocations(context: IAppServiceWizardContext): Promise<string[]> {
    const headers = createHttpHeaders({
        'Content-Type': 'application/json',
    });

    const options: AzExtRequestPrepareOptions = {
        url: `${context.environment.resourceManagerEndpointUrl}/subscriptions/${context.subscriptionId}/providers/Microsoft.Web/geoRegions?api-version=2023-01-01&sku=FlexConsumption`,
        method: 'GET',
        headers
    };

    const client = await createGenericClient(context, context);
    const result = await client.sendRequest(createPipelineRequest(options)) as AzExtPipelineResponse;
    const locations = ((result.parsedBody as { value: Location[] }).value.map(loc => loc.name) as string[])
    return locations;
}
