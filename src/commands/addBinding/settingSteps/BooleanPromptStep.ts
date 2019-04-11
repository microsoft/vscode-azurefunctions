/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem } from "vscode";
import { AzureWizardPromptStep } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { IFunctionSetting } from "../../../templates/IFunctionSetting";
import { IBindingWizardContext } from "../IBindingWizardContext";

export class BooleanPromptStep extends AzureWizardPromptStep<IBindingWizardContext> {
    private readonly _setting: IFunctionSetting;
    constructor(setting: IFunctionSetting) {
        super();
        this._setting = setting;
    }

    public async prompt(wizardContext: IBindingWizardContext): Promise<void> {
        const picks: QuickPickItem[] = [
            { label: 'true', description: '' },
            { label: 'false', description: '' }
        ];
        wizardContext[this._setting.name] = (await ext.ui.showQuickPick(picks, { placeHolder: this._setting.label })).label;
    }

    public shouldPrompt(wizardContext: IBindingWizardContext): boolean {
        return !wizardContext[this._setting.name];
    }
}
