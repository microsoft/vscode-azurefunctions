/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { IBindingTemplate } from '../../templates/IBindingTemplate';
import { IFunctionSetting, ValueType } from '../../templates/IFunctionSetting';
import { nonNullProp } from '../../utils/nonNull';
import { BooleanPromptStep } from '../createFunction/genericSteps/BooleanPromptStep';
import { EnumPromptStep } from '../createFunction/genericSteps/EnumPromptStep';
import { LocalAppSettingListStep } from '../createFunction/genericSteps/LocalAppSettingListStep';
import { StringPromptStep } from '../createFunction/genericSteps/StringPromptStep';
import { BindingNameStep } from './BindingNameStep';
import { IBindingWizardContext } from './IBindingWizardContext';

export class BindingListStep extends AzureWizardPromptStep<IBindingWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(wizardContext: IBindingWizardContext): Promise<void> {
        const direction: string = nonNullProp(wizardContext, 'bindingDirection');
        const placeHolder: string = localize('selectBinding', 'Select binding with direction "{0}"', direction);
        wizardContext.bindingTemplate = (await ext.ui.showQuickPick(this.getPicks(direction), { placeHolder })).data;
    }

    public shouldPrompt(wizardContext: IBindingWizardContext): boolean {
        return !wizardContext.bindingTemplate;
    }

    public async getSubWizard(wizardContext: IBindingWizardContext): Promise<IWizardOptions<IBindingWizardContext> | undefined> {
        const binding: IBindingTemplate | undefined = wizardContext.bindingTemplate;
        if (binding) {
            const promptSteps: AzureWizardPromptStep<IBindingWizardContext>[] = [];
            addBindingSteps(binding.settings, promptSteps);
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

export function addBindingSteps(settings: IFunctionSetting[], promptSteps: AzureWizardPromptStep<IBindingWizardContext>[]): void {
    for (const setting of settings) {
        if (setting.name.toLowerCase() === 'name') {
            promptSteps.push(new BindingNameStep(setting));
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
