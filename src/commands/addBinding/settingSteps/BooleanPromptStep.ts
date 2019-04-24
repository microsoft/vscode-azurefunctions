/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem } from "vscode";
import { ext } from "../../../extensionVariables";
import { IBindingWizardContext } from "../IBindingWizardContext";
import { BindingSettingStepBase } from "./BindingSettingStepBase";

export class BooleanPromptStep extends BindingSettingStepBase {
    public async promptCore(_wizardContext: IBindingWizardContext): Promise<string> {
        const picks: QuickPickItem[] = [
            { label: 'true', description: '' },
            { label: 'false', description: '' }
        ];
        return (await ext.ui.showQuickPick(picks, { placeHolder: this._setting.label })).label;
    }
}
