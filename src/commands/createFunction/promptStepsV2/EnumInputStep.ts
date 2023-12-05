/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { type FunctionV2WizardContext } from "../IFunctionWizardContext";
import { QuickPickInputStep } from "./QuickPickInputStep";

export class EnumInputStep<T extends FunctionV2WizardContext> extends QuickPickInputStep<T> {
    protected async getPicks(_context: T): Promise<IAzureQuickPickItem<string>[]> {
        const enums = nonNullProp(this.input, 'enum');
        return enums.map(e => { return { data: e.value, label: e.display }; });
    }
}
