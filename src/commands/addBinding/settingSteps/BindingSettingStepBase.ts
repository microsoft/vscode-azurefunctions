/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { type BindingSettingValue } from "../../../funcConfig/function";
import { type IBindingSetting } from "../../../templates/IBindingTemplate";
import { type ParsedInput } from "../../../templates/script/parseScriptTemplatesV2";
import { getBindingSetting, setBindingSetting, type IFunctionWizardContext } from "../../createFunction/IFunctionWizardContext";

export abstract class BindingSettingStepBase extends AzureWizardPromptStep<IFunctionWizardContext> {
    protected readonly _setting: IBindingSetting | ParsedInput;
    protected readonly _resourceType: string;

    constructor(setting: IBindingSetting | ParsedInput) {
        super();
        this._setting = setting;
        this.id = setting.name;
        this._resourceType = (setting as IBindingSetting).resourceType ?? (setting as ParsedInput).resource ?? '';
    }

    public abstract promptCore(context: IFunctionWizardContext): Promise<BindingSettingValue>;

    public async prompt(context: IFunctionWizardContext): Promise<void> {
        setBindingSetting(context, this._setting as IBindingSetting, await this.promptCore(context));
    }

    public shouldPrompt(context: IFunctionWizardContext): boolean {
        return !getBindingSetting(context, this._setting);
    }
}
