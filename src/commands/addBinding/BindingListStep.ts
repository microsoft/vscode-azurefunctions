/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { IBindingTemplate } from '../../templates/IBindingTemplate';
import { nonNullProp } from '../../utils/nonNull';
import { IBindingWizardContext } from './IBindingWizardContext';
import { addBindingSettingSteps } from './settingSteps/addBindingSettingSteps';

export class BindingListStep extends AzureWizardPromptStep<IBindingWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(context: IBindingWizardContext): Promise<void> {
        const direction: string = nonNullProp(context, 'bindingDirection');
        const placeHolder: string = localize('selectBinding', 'Select binding with direction "{0}"', direction);
        context.bindingTemplate = (await ext.ui.showQuickPick(this.getPicks(direction), { placeHolder })).data;
    }

    public shouldPrompt(context: IBindingWizardContext): boolean {
        return !context.bindingTemplate;
    }

    public async getSubWizard(context: IBindingWizardContext): Promise<IWizardOptions<IBindingWizardContext> | undefined> {
        const binding: IBindingTemplate | undefined = context.bindingTemplate;
        if (binding) {
            const promptSteps: AzureWizardPromptStep<IBindingWizardContext>[] = [];
            addBindingSettingSteps(binding.settings, promptSteps);
            return { promptSteps };
        } else {
            return undefined;
        }
    }

    private async getPicks(direction: string): Promise<IAzureQuickPickItem<IBindingTemplate>[]> {
        // wait for template provider task to signal that bindings have been defined
        await ext.templateProviderTask;

        const bindings: IBindingTemplate[] = ext.scriptBindings
            .filter(b => b.direction.toLowerCase() === direction.toLowerCase())
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
        return bindings.map(b => { return { label: b.displayName, data: b }; });
    }
}
