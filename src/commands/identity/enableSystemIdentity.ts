/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type ExecuteActivityContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { type SystemIdentityTreeItemBase } from "../../tree/remoteProject/SystemIdentityTreeItemBase";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { createActivityContext } from "../../utils/activityUtils";
import { EnableSystemIdentityAssignStep } from "./EnableSystemIdentityStep";
import { type ManagedIdentityAssignContext } from "./ManagedIdentityAssignContext";

export async function enableSystemIdentity(context: IActionContext, node: SystemIdentityTreeItemBase): Promise<undefined> {
    const grandparentNode = node.parent.parent as SlotTreeItem;
    const title: string = localize('enabling', 'Enabling system-assigned identity for "{0}"...', grandparentNode.site.fullName);

    const wizardContext: ManagedIdentityAssignContext & ExecuteActivityContext = Object.assign(context, {
        site: grandparentNode.site,
        ...grandparentNode.site.subscription,
        ...(await createActivityContext()),
        activityTitle: title
    });
    const wizard = new AzureWizard(wizardContext, {
        executeSteps: [new EnableSystemIdentityAssignStep()],
        title
    });

    await node.runWithTemporaryDescription(context, localize('enabling', 'Enabling system-assigned identity...'), async () => {
        await wizard.execute();
    });

    void grandparentNode.refresh(context)
}
