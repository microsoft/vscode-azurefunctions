/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppInsightsNameStep, type IAppServiceWizardContext } from "@microsoft/vscode-azext-azureappservice";
import { ResourceGroupNameStep, StorageAccountNameStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardPromptStep, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import { setConsumptionPlanProperties } from "./FunctionAppHostingPlanStep";

export class ConfigureCommonNamesStep extends AzureWizardPromptStep<IAppServiceWizardContext> {
    public async prompt(_context: IAppServiceWizardContext): Promise<void> {
        // do nothing, will be handled in configuration
    }

    public shouldPrompt(_context: IAppServiceWizardContext): boolean {
        // never prompt
        return false;
    }

    public async configureBeforePrompt(context: IAppServiceWizardContext): Promise<void> {
        if (!context.advancedCreation) {
            const newName: string | undefined = await context.relatedNameTask;

            context.newResourceGroupName = context.newResourceGroupName || newName;
            setConsumptionPlanProperties(context);
            context.newStorageAccountName = newName;
            context.newAppInsightsName = newName;
        }
    }

    public async getSubWizard(context: IAppServiceWizardContext): Promise<IWizardOptions<IAppServiceWizardContext> | undefined> {
        if (!context.advancedCreation &&
            !context.newResourceGroupName &&
            !context.newStorageAccountName &&
            !context.newAppInsightsName) {
            return { promptSteps: [new ResourceGroupNameStep(), new StorageAccountNameStep(), new AppInsightsNameStep()] };
        }

        return;
    }
}
