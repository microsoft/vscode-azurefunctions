/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { IFunctionSetting } from "../../../templates/IFunctionSetting";
import { IFunctionWizardContext } from "../IFunctionWizardContext";

export class StringPromptStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    private readonly _setting: IFunctionSetting;
    constructor(setting: IFunctionSetting) {
        super();
        this._setting = setting;
    }

    public async prompt(wizardContext: IFunctionWizardContext): Promise<void> {
        wizardContext[this._setting.name] = await ext.ui.showInputBox({
            placeHolder: this._setting.label,
            prompt: this._setting.description || localize('stringSettingPrompt', 'Provide a \'{0}\'', this._setting.label),
            validateInput: (s: string): string | undefined => this._setting.validateSetting(s),
            value: this._setting.defaultValue
        });
    }

    public shouldPrompt(wizardContext: IFunctionWizardContext): boolean {
        return !wizardContext[this._setting.name];
    }
}
