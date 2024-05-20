/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IAppServiceWizardContext } from "@microsoft/vscode-azext-azureappservice";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { setConsumptionPlanProperties } from "./FunctionAppHostingPlanStep";
import { type IFunctionAppWizardContext } from "./IFunctionAppWizardContext";

export class ConfigureCommonNamesStep extends AzureWizardPromptStep<IAppServiceWizardContext> {
    public async prompt(_context: IAppServiceWizardContext): Promise<void> {
        // do nothing, will be handled in configuration
    }

    public shouldPrompt(_context: IAppServiceWizardContext): boolean {
        // never prompt
        return false;
    }

    public async configureBeforePrompt(context: IFunctionAppWizardContext): Promise<void> {
        if (!context.advancedCreation) {
            const newName: string | undefined = await context.relatedNameTask;
            if (!newName) {
                throw new Error(localize('noUniqueName', 'Failed to generate unique name for resources. Use advanced creation to manually enter resource names.'));
            }
            context.newResourceGroupName = context.newResourceGroupName || newName;
            setConsumptionPlanProperties(context);
            context.newStorageAccountName = newName;
            context.newAppInsightsName = newName;
        }
    }
}
