/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ServiceConnectorGroupTreeItem, createLinker } from "@microsoft/vscode-azext-serviceconnector";
import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../localize";
import { type SlotTreeItem } from "../tree/SlotTreeItem";
import { createActivityContext } from "../utils/activityUtils";
import { pickFunctionApp } from "../utils/pickFunctionApp";

export async function createServiceConnector(context: IActionContext, item?: SlotTreeItem | ServiceConnectorGroupTreeItem): Promise<void> {
    item ??= await pickFunctionApp(context);

    if (item instanceof ServiceConnectorGroupTreeItem) {
        item = <SlotTreeItem>item.parent;
    }

    const activityContext = {
        ...context,
        ...await createActivityContext(),
        activityTitle: localize('createServiceConnector', 'Create connection'),
    }

    await createLinker(activityContext, item.id, item.subscription);
    await item.refresh(context);
}
