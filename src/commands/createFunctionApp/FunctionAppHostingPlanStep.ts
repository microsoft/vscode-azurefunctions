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

export class FunctionAppHostingPlanStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const placeHolder: string = localize('selectHostingPlan', 'Select a hosting plan.');
        const picks: IAzureQuickPickItem<[boolean, RegExp | undefined]>[] = [
            { label: localize('flexConsumption', 'Flex Consumption'), data: [true, undefined] },
            { label: localize('premium', 'Premium'), data: [false, /^EP$/i] },
            { label: localize('dedicated', 'App Service Plan'), data: [false, /^((?!EP|Y|FC).)*$/i] }
        ];

        [context.useFlexConsumptionPlan, context.planSkuFamilyFilter] = (await context.ui.showQuickPick(picks, { placeHolder })).data;
        await setLocationsTask(context);
        if (context.useFlexConsumptionPlan) {
            setFlexConsumptionPlanProperties(context);
        }
    }

    public shouldPrompt(context: IFunctionAppWizardContext): boolean {
        return context.useFlexConsumptionPlan === undefined && context.dockerfilePath === undefined;
    }

    public configureBeforePrompt(context: IFunctionAppWizardContext): void | Promise<void> {
        if (!context.advancedCreation) {
            setFlexConsumptionPlanProperties(context);
        }
    }
}

export function setFlexConsumptionPlanProperties(context: IAppServiceWizardContext): void {
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
        url: `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Web/geoRegions?api-version=2023-01-01&sku=FlexConsumption`,
        method: 'GET',
        headers
    };

    const client = await createGenericClient(context, context);
    const result = await client.sendRequest(createPipelineRequest(options)) as AzExtPipelineResponse;
    const locations = ((result.parsedBody as { value: Location[] }).value.map(loc => loc.name) as string[])
    return locations;
}
