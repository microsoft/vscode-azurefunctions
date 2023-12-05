/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { BindingCreateStep } from "./BindingCreateStep";
import { BindingDirectionStep } from "./BindingDirectionStep";
import { BindingListStep } from "./BindingListStep";
import { type IBindingWizardContext } from "./IBindingWizardContext";

export function createBindingWizard(wizardContext: IBindingWizardContext): AzureWizard<IBindingWizardContext> {
    return new AzureWizard(wizardContext, {
        promptSteps: [new BindingDirectionStep(), new BindingListStep()],
        executeSteps: [new BindingCreateStep()],
        title: localize('addBinding', 'Add new binding')
    });
}
