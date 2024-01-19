/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { type BindingSettingValue } from "../../../funcConfig/function";
import { type IBindingSetting } from "../../../templates/IBindingTemplate";
import { type IBindingWizardContext } from "../IBindingWizardContext";
import { BindingSettingStepBase } from "./BindingSettingStepBase";

export class EnumPromptStep extends BindingSettingStepBase {
    // not used by v2 schema so enforce  IBindingSetting
    protected readonly _setting: IBindingSetting;

    public async promptCore(context: IBindingWizardContext): Promise<BindingSettingValue> {
        const picks: IAzureQuickPickItem<string>[] = this._setting.enums.map(e => { return { data: e.value, label: e.displayName }; });
        return (await context.ui.showQuickPick(picks, { placeHolder: this._setting.label })).data;
    }
}
