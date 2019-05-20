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

    public abstract promptCore(context: IBindingWizardContext): Promise<string | undefined>;

    public async prompt(context: IBindingWizardContext): Promise<void> {
        setBindingSetting(context, this._setting, await this.promptCore(context));
    }

    public shouldPrompt(context: IBindingWizardContext): boolean {
        return !getBindingSetting(context, this._setting);
    }
}
