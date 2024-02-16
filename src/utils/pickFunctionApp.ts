/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type ITreeItemPickerContext } from "@microsoft/vscode-azext-utils";
import { type PickAppResourceOptions } from "@microsoft/vscode-azext-utils/hostapi";
import { localize } from "../localize";
import { type SlotTreeItem } from "../tree/SlotTreeItem";
import { pickAppResource } from "./pickAppResource";

export async function pickFunctionApp(context: ITreeItemPickerContext, options?: PickAppResourceOptions): Promise<SlotTreeItem> {
    const functionApp = await pickAppResource(context, options);

    if (functionApp.contextValue.includes('container')) {
        throw new Error(localize('containerFunctionAppError', 'Cannot perform this action on a containerized function app.'));
    } else {
        return functionApp;
    }
}
