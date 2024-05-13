/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp, type IAzureQuickPickItem, type IAzureQuickPickOptions } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { type IFunctionAppWizardContext } from "../IFunctionAppWizardContext";
import { type Sku } from "../stacks/models/FlexSkuModel";

export class InstanceMemoryMBPromptStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const flexSku = nonNullProp(context, 'newSiteFlexSku');
        const options: IAzureQuickPickOptions = {
            placeHolder: localize('instanceMemory', 'Select an instance memory size'),
        }

        context.instanceMemoryMB = (await context.ui.showQuickPick(this.getPicks(flexSku), options)).data;
    }

    public shouldPrompt(context: IFunctionAppWizardContext): boolean {
        return !context.instanceMemoryMB;
    }

    private getPicks(flexSku: Sku): IAzureQuickPickItem<number>[] {
        const picks = flexSku.instanceMemoryMB.map(im => { return { label: im.size.toString(), data: im.size, description: im.isDefault ? 'Default' : undefined } });
        return picks.sort((a, b) => Number(!!b.description) - Number(!!a.description));
    }
}
