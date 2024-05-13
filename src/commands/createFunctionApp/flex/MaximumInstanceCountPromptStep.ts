/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp, type AzExtInputBoxOptions } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { type IFunctionAppWizardContext } from "../IFunctionAppWizardContext";
import { type Sku } from "../stacks/models/FlexSkuModel";

export class MaximumInstanceCountPromptStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const flexSku = nonNullProp(context, 'newSiteFlexSku');
        const options: AzExtInputBoxOptions = {
            validateInput: (val: string) => this.validateInput(flexSku, val),
            placeHolder: localize('maximumInstanceCount', 'Enter the maximum instance count'),
            value: flexSku.maximumInstanceCount.defaultValue.toString()
        }

        context.maximumInstanceCount = Number(await context.ui.showInputBox(options));
    }

    public shouldPrompt(context: IFunctionAppWizardContext): boolean {
        return !context.maximumInstanceCount;
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
