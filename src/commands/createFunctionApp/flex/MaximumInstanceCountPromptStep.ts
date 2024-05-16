/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp, type AzExtInputBoxOptions } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { type IFlexFunctionAppWizardContext } from "../IFunctionAppWizardContext";
import { type Sku } from "../stacks/models/FlexSkuModel";

export class MaximumInstanceCountPromptStep extends AzureWizardPromptStep<IFlexFunctionAppWizardContext> {
    public async prompt(context: IFlexFunctionAppWizardContext): Promise<void> {
        const flexSku = nonNullProp(context, 'newFlexSku');
        const options: AzExtInputBoxOptions = {
            validateInput: (val: string) => this.validateInput(flexSku, val),
            prompt: localize('maximumInstanceCount', 'Enter the maximum instance count'),
            value: flexSku.maximumInstanceCount.defaultValue.toString()
        }

        context.newFlexMaximumInstanceCount = Number(await context.ui.showInputBox(options));
    }

    public shouldPrompt(context: IFlexFunctionAppWizardContext): boolean {
        return !context.newFlexMaximumInstanceCount;
    }

    private validateInput(flexSku: Sku, val: string): string | undefined {
        const num = Number(val);

        const { lowestMaximumInstanceCount, highestMaximumInstanceCount } = flexSku.maximumInstanceCount;
        if (isNaN(num)) {
            return localize('enterNumber', 'Enter a valid maximum instance count')
        } else if (!Number.isInteger(num)) {
            return localize('integersOnly', 'Enter only whole integer values');
        } else if (num < lowestMaximumInstanceCount || num > highestMaximumInstanceCount) {
            return localize('maximumInstanceCount', `Enter a number between ${lowestMaximumInstanceCount}-${highestMaximumInstanceCount}`);
        }

        return undefined;
    }
}
