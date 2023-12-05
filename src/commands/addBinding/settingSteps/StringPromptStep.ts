/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type BindingSettingValue } from "../../../funcConfig/function";
import { localize } from "../../../localize";
import { type IBindingWizardContext } from "../IBindingWizardContext";
import { BindingSettingStepBase } from "./BindingSettingStepBase";

export class StringPromptStep extends BindingSettingStepBase {
    public async promptCore(context: IBindingWizardContext): Promise<BindingSettingValue> {
        return await context.ui.showInputBox({
            placeHolder: this._setting.label,
            prompt: this._setting.description || localize('stringSettingPrompt', 'Provide a \'{0}\'', this._setting.label),
            validateInput: async (s): Promise<string | undefined> => await this.validateInput(context, s),
            value: await this.getDefaultValue(context)
        });
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async getDefaultValue(_wizardContext: IBindingWizardContext): Promise<string | undefined> {
        return this._setting === undefined ? undefined : String(this._setting.defaultValue);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async validateInput(_wizardContext: IBindingWizardContext, val: string | undefined): Promise<string | undefined> {
        return this._setting.validateSetting(val);
    }
}
