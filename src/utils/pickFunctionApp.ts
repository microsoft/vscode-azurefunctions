/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type ITreeItemPickerContext } from "@microsoft/vscode-azext-utils";
import { functionFilter } from "../constants";
import { ext } from "../extensionVariables";
import { type SlotTreeItem } from "../tree/SlotTreeItem";

export async function pickFunctionApp(context: ITreeItemPickerContext): Promise<SlotTreeItem> {
    return await ext.rgApi.pickAppResource<SlotTreeItem>(context, {
        filter: functionFilter
    });
}
