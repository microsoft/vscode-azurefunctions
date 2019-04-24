/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureQuickPickItem } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { IBindingWizardContext } from "../IBindingWizardContext";
import { BindingSettingStepBase } from "./BindingSettingStepBase";

export class EnumPromptStep extends BindingSettingStepBase {
    public async promptCore(_wizardContext: IBindingWizardContext): Promise<string> {
        const picks: IAzureQuickPickItem<string>[] = this._setting.enums.map(e => { return { data: e.value, label: e.displayName }; });
        return (await ext.ui.showQuickPick(picks, { placeHolder: this._setting.label })).data;
    }
}
