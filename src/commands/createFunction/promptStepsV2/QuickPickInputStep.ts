/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { FunctionV2WizardContext } from "../FunctionV2WizardContext";
import { PromptSchemaStepBase } from "./PromptSchemaStepBase";

export abstract class QuickPickInputStep<T extends FunctionV2WizardContext> extends PromptSchemaStepBase<T> {
    protected async promptAction(context: T): Promise<unknown | undefined> {
        const picks: IAzureQuickPickItem<unknown | undefined>[] = await this.getPicks(context);

        if (!this.input.required) {
            picks.push({
                label: localize('skipForNow', '$(clock) Skip for now'),
                data: undefined,
                suppressPersistence: true
            });
        }

        return (await context.ui.showQuickPick(picks, { placeHolder: this.input.help })).data;
    }

    protected abstract getPicks(context: T): Promise<IAzureQuickPickItem<unknown>[]>;
}
