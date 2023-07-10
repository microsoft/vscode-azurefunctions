/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureQuickPickItem, nonNullProp } from "@microsoft/vscode-azext-utils";
import { FunctionWizardV2Context } from "../FunctionV2WizardContext";
import { PromptSchemaBaseStep } from "./PromptSchemaBaseStep";

export class EnumInputStep<T extends FunctionWizardV2Context> extends PromptSchemaBaseStep<T> {
    protected async promptAction(context: T): Promise<string> {
        const enums = nonNullProp(this.input, 'enum');
        const picks: IAzureQuickPickItem<string>[] = enums.map(e => { return { data: e.value, label: e.display }; });
        return (await context.ui.showQuickPick(picks, { placeHolder: this.input.help })).data;
    }
}
