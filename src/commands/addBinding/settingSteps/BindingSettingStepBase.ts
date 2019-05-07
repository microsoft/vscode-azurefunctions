/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "vscode-azureextensionui";
import { IBindingSetting } from "../../../templates/IBindingTemplate";
import { getBindingSetting, setBindingSetting } from "../../createFunction/IFunctionWizardContext";
import { IBindingWizardContext } from "../IBindingWizardContext";

export abstract class BindingSettingStepBase extends AzureWizardPromptStep<IBindingWizardContext> {
    protected readonly _setting: IBindingSetting;

    constructor(setting: IBindingSetting) {
        super();
        this._setting = setting;
    }

    public abstract promptCore(wizardContext: IBindingWizardContext): Promise<string | undefined>;

    public async prompt(wizardContext: IBindingWizardContext): Promise<void> {
        setBindingSetting(wizardContext, this._setting, await this.promptCore(wizardContext));
    }

    public shouldPrompt(wizardContext: IBindingWizardContext): boolean {
        return !getBindingSetting(wizardContext, this._setting);
    }
}
