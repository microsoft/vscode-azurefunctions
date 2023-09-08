/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ServiceConnectorTreeItem, validateLinker } from "@microsoft/vscode-azext-serviceconnector";
import { IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../localize";
import { SlotTreeItem } from "../tree/SlotTreeItem";
import { createActivityContext } from "../utils/activityUtils";
import { pickFunctionApp } from "../utils/pickFunctionApp";

export async function validateServiceConnector(context: IActionContext, item?: SlotTreeItem | ServiceConnectorTreeItem): Promise<void> {
    let serviceConnectorName: string | undefined = undefined
    item ??= await pickFunctionApp(context);

    if (item instanceof ServiceConnectorTreeItem) {
        serviceConnectorName = item.label;
        item = <SlotTreeItem>item.parent?.parent;
    }

    const activityContext = {
        ...context,
        ...await createActivityContext(),
        activityTitle: localize('validate', `Validate connection "{0}"`, serviceConnectorName),
    }

    await validateLinker(activityContext, item.id, item.subscription, serviceConnectorName);
}
