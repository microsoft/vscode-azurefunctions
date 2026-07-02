/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type BindingSettingValue } from "../../../funcConfig/function";
import { localize } from "../../../localize";
import { type IBindingSetting } from "../../../templates/IBindingTemplate";
import { type IBindingWizardContext } from "../IBindingWizardContext";
import { BindingSettingStepBase } from "./BindingSettingStepBase";

export class StringPromptStep extends BindingSettingStepBase {
    // not used by v2 schema so enforce  IBindingSetting
    declare protected readonly _setting: IBindingSetting;
    public async promptCore(context: IBindingWizardContext): Promise<BindingSettingValue> {
        return await context.ui.showInputBox({
            placeHolder: this._setting.label,
            prompt: this._setting.description || localize('stringSettingPrompt', 'Provide a \'{0}\'', this._setting.label),
            validateInput: async (s): Promise<string | undefined> => await this.validateInput(context, s),
            value: await this.getDefaultValue(context)
        });
    }

     
    public async getDefaultValue(_wizardContext: IBindingWizardContext): Promise<string | undefined> {
        // Avoid returning the literal string "undefined" (e.g. from `String(undefined)`) when the
        // template doesn't declare a default value — otherwise it would pre-fill the input box
        // and end up being submitted verbatim as the setting's value.
        if (this._setting === undefined || this._setting.defaultValue === undefined || this._setting.defaultValue === null) {
            return undefined;
        }
        return String(this._setting.defaultValue);
    }

     
    public async validateInput(_wizardContext: IBindingWizardContext, val: string | undefined): Promise<string | undefined> {
        return this._setting.validateSetting(val);
    }
}
