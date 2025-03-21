/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type ExecuteActivityContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { type SystemIdentityTreeItemBase } from "../../tree/remoteProject/SystemIdentityTreeItemBase";
import { createActivityContext } from "../../utils/activityUtils";
import { EnableSystemIdentityAssignStep } from "./EnableSystemIdentityStep";
import { type ManagedIdentityAssignContext } from "./ManagedIdentityAssignContext";

export async function enableSystemIdentity(context: IActionContext, node: SystemIdentityTreeItemBase): Promise<undefined> {
    const slotTreeItem = node.parent.parent;
    const title: string = localize('enabling', 'Enable system assigned identity for "{0}".', slotTreeItem.site.fullName);

    const wizardContext: ManagedIdentityAssignContext & ExecuteActivityContext = Object.assign(context, {
        site: slotTreeItem.site,
        ...slotTreeItem.site.subscription,
        ...(await createActivityContext()),
        activityTitle: title
    });
    const wizard = new AzureWizard(wizardContext, {
        executeSteps: [new EnableSystemIdentityAssignStep()]
    });

    await node.runWithTemporaryDescription(context, localize('enabling', 'Enabling system assigned identity...'), async () => {
        await wizard.execute();
    });

    void slotTreeItem.refresh(context)
}
