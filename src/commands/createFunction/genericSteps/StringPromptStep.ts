/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { IFunctionSetting } from "../../../templates/IFunctionSetting";
import { IBindingWizardContext } from "../../addBinding/IBindingWizardContext";

export class StringPromptStep extends AzureWizardPromptStep<IBindingWizardContext> {
    private readonly _setting: IFunctionSetting;
    constructor(setting: IFunctionSetting) {
        super();
        this._setting = setting;
    }

    public async prompt(wizardContext: IBindingWizardContext): Promise<void> {
        wizardContext[this._setting.name] = await ext.ui.showInputBox({
            placeHolder: this._setting.label,
            prompt: this._setting.description || localize('stringSettingPrompt', 'Provide a \'{0}\'', this._setting.label),
            validateInput: async (s): Promise<string | undefined> => await this.validateInput(wizardContext, s),
            value: await this.getDefaultValue(wizardContext)
        });
    }

    public shouldPrompt(wizardContext: IBindingWizardContext): boolean {
        return !wizardContext[this._setting.name];
    }

    public async getDefaultValue(_wizardContext: IBindingWizardContext): Promise<string | undefined> {
        return this._setting.defaultValue;
    }

    public async validateInput(_wizardContext: IBindingWizardContext, val: string | undefined): Promise<string | undefined> {
        return this._setting.validateSetting(val);
    }
}
