/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { BindingSettingValue } from "../../../funcConfig/function";
import { envUtils } from "../../../utils/envUtils";
import { IBindingWizardContext } from "../IBindingWizardContext";
import { BindingSettingStepBase } from "./BindingSettingStepBase";

export class BooleanPromptStep extends BindingSettingStepBase {
    public async promptCore(context: IBindingWizardContext): Promise<BindingSettingValue> {
        let picks: IAzureQuickPickItem<boolean>[] = [true, false].map(v => { return { label: String(v), data: v }; });

        // Make sure the correct default value is at the top of the list
        if (!envUtils.isEnvironmentVariableSet(this._setting.defaultValue)) {
            picks = picks.reverse();
        }

        return (await context.ui.showQuickPick(picks, { placeHolder: this._setting.description || this._setting.label })).data;
    }
}
