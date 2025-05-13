/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullProp, type IAzureQuickPickItem, type IAzureQuickPickOptions } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { type IFlexFunctionAppWizardContext } from "../IFunctionAppWizardContext";
import { type Sku } from "../stacks/models/FlexSkuModel";

export class InstanceMemoryMBPromptStep extends AzureWizardPromptStep<IFlexFunctionAppWizardContext> {
    public async prompt(context: IFlexFunctionAppWizardContext): Promise<void> {
        const flexSku = nonNullProp(context, 'newFlexSku');
        const options: IAzureQuickPickOptions = {
            placeHolder: localize('instanceMemory', 'Select an instance memory size'),
        }

        context.newFlexInstanceMemoryMB = (await context.ui.showQuickPick(this.getPicks(flexSku), options)).data;
    }

    public shouldPrompt(context: IFlexFunctionAppWizardContext): boolean {
        return !context.newFlexInstanceMemoryMB;
    }

    public configureBeforePrompt(context: IFlexFunctionAppWizardContext): void | Promise<void> {
        // use default instance memory size if not using advanced creation
        if (!context.advancedCreation) {
            context.newFlexInstanceMemoryMB = context.newFlexSku?.instanceMemoryMB.find(im => im.isDefault)?.size;
        }
    }

    private getPicks(flexSku: Sku): IAzureQuickPickItem<number>[] {
        const picks = flexSku.instanceMemoryMB.map(im => { return { label: im.size.toString(), data: im.size, description: im.isDefault ? 'Default' : undefined } });
        return picks.sort((a, b) => Number(!!b.description) - Number(!!a.description));
    }
}
