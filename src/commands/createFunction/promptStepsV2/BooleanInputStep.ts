/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { envUtils } from "../../../utils/envUtils";
import { FunctionV2WizardContext } from "../IFunctionWizardContext";
import { QuickPickInputStep } from "./QuickPickInputStep";

export class BooleanInputStep<T extends FunctionV2WizardContext> extends QuickPickInputStep<T> {
    protected async getPicks(_context: T): Promise<IAzureQuickPickItem<boolean>[]> {
        let picks: IAzureQuickPickItem<boolean>[] = [true, false].map(v => { return { label: String(v), data: v }; });

        // Make sure the correct default value is at the top of the list
        if (!envUtils.isEnvironmentVariableSet(this.input.defaultValue)) {
            picks = picks.reverse();
        }

        return picks;
    }
}
