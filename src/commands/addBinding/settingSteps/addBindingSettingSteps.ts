/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { ResourceType, ValueType, type IBindingSetting } from "../../../templates/IBindingTemplate";
import { type IBindingWizardContext } from "../IBindingWizardContext";
import { BindingNameStep } from "./BindingNameStep";
import { BooleanPromptStep } from "./BooleanPromptStep";
import { EnumPromptStep } from "./EnumPromptStep";
import { LocalAppSettingListStep } from "./LocalAppSettingListStep";
import { StringPromptStep } from "./StringPromptStep";
import { EventHubNameStep } from "./eventHub/EventHubNameStep";

export function addBindingSettingSteps(settings: IBindingSetting[], promptSteps: AzureWizardPromptStep<IBindingWizardContext>[]): void {
    for (const setting of settings) {
        const name: string = setting.name.toLowerCase();
        if (setting.resourceType === ResourceType.ExistingFile) {
            // don't prompt for this as we already ask the user for this in the wizard
            continue;
        } else if (name === 'name') {
            promptSteps.push(new BindingNameStep(setting));
        } else if (name === 'eventhubname') {
            promptSteps.push(new EventHubNameStep(setting));
        } else if (setting.resourceType !== undefined) {
            promptSteps.push(new LocalAppSettingListStep(setting));
        } else {
            switch (setting.valueType) {
                case ValueType.boolean:
                    promptSteps.push(new BooleanPromptStep(setting));
                    break;
                case ValueType.enum:
                    promptSteps.push(new EnumPromptStep(setting));
                    break;
                default:
                    // Default to 'string' type for any valueType that isn't supported
                    promptSteps.push(new StringPromptStep(setting));
                    break;
            }
        }
    }
}
