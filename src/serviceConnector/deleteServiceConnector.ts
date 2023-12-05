/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ServiceConnectorTreeItem, deleteLinker } from "@microsoft/vscode-azext-serviceconnector";
import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../localize";
import { type SlotTreeItem } from "../tree/SlotTreeItem";
import { createActivityContext } from "../utils/activityUtils";
import { pickFunctionApp } from "../utils/pickFunctionApp";

export async function deleteServiceConnector(context: IActionContext, item?: SlotTreeItem | ServiceConnectorTreeItem): Promise<void> {
    let serviceConnectorName: string | undefined = undefined;
    item ??= await pickFunctionApp(context);

    if (item instanceof ServiceConnectorTreeItem) {
        serviceConnectorName = item.label;
        item = <SlotTreeItem>item.parent?.parent;
    }

    const activityContext = {
        ...context,
        ...await createActivityContext(),
        activityTitle: localize('deleteServiceConnector', 'Delete connection'),
    }

    await deleteLinker(activityContext, item.id, item.subscription, serviceConnectorName);
    await item.refresh(context);
}
