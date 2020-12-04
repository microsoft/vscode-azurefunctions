/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion } from '../../FuncVersion';
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
        context.bindingTemplate = (await context.ui.showQuickPick(this.getPicks(context, direction), { placeHolder })).data;
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

    private async getPicks(context: IBindingWizardContext, direction: string): Promise<IAzureQuickPickItem<IBindingTemplate>[]> {
        const language: ProjectLanguage = nonNullProp(context, 'language');
        const version: FuncVersion = nonNullProp(context, 'version');
        const templates: IBindingTemplate[] = await ext.templateProvider.getBindingTemplates(context, context.projectPath, language, version);
        return templates
            .filter(b => b.direction.toLowerCase() === direction.toLowerCase())
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
            .map(b => { return { label: b.displayName, data: b }; });
    }
}
