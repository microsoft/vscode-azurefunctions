/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IResourceGroupWizardContext, ResourceGroupListStep, resourceGroupNamingRules } from "@microsoft/vscode-azext-azureutils";
import { AzureNameStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";

type SchedulerNamingContext = IResourceGroupWizardContext & { schedulerName?: string };

export class SchedulerNamingStep extends AzureNameStep<SchedulerNamingContext> {
    async prompt(wizardContext: SchedulerNamingContext): Promise<void> {
        wizardContext.schedulerName = await wizardContext.ui.showInputBox({
            prompt: localize('schedulerNamingStepPrompt', 'Enter a name for the new scheduler')
        });

        const preferredName = wizardContext.schedulerName
            .replace(new RegExp(resourceGroupNamingRules.invalidCharsRegExp, 'g'), '')
            .replace(/\.+$/, '');
        wizardContext.relatedNameTask = Promise.resolve(preferredName
            ? await this.generateRelatedName(wizardContext, preferredName, resourceGroupNamingRules)
            : undefined);
    }

    shouldPrompt(wizardContext: SchedulerNamingContext): boolean {
        return !wizardContext.schedulerName;
    }

    protected async isRelatedNameAvailable(wizardContext: SchedulerNamingContext, name: string): Promise<boolean> {
        return !name.endsWith('.') && ResourceGroupListStep.isNameAvailable(wizardContext, name);
    }
}
