/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { BindingSettingValue } from "../../../funcConfig/function";
import { IBindingSetting } from "../../../templates/IBindingTemplate";
import { getBindingSetting, setBindingSetting } from "../../createFunction/IFunctionWizardContext";
import { IBindingWizardContext } from "../IBindingWizardContext";

export abstract class BindingSettingStepBase extends AzureWizardPromptStep<IBindingWizardContext> {
    protected readonly _setting: IBindingSetting;

    constructor(setting: IBindingSetting) {
        super();
        this._setting = setting;
        this.id = setting.name;
    }

    public abstract promptCore(context: IBindingWizardContext): Promise<BindingSettingValue>;

    public async prompt(context: IBindingWizardContext): Promise<void> {
        setBindingSetting(context, this._setting, await this.promptCore(context));
    }

    public shouldPrompt(context: IBindingWizardContext): boolean {
        return !getBindingSetting(context, this._setting);
    }
}
