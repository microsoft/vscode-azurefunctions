/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, DialogResponses, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type UserAssignedIdentityTreeItem } from '../../tree/remoteProject/UserAssignedIdentityTreeItem';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { createActivityContext } from '../../utils/activityUtils';
import { type ManagedIdentityAssignContext } from './ManagedIdentityAssignContext';
import { ManagedIdentityUnassignStep } from './ManagedIdentityUnassignStep';

export async function unassignManagedIdentity(context: IActionContext, node: UserAssignedIdentityTreeItem): Promise<void> {

    const slotTreeItem = node.parent.parent as SlotTreeItem;
    await slotTreeItem.initSite(context);
    const site = slotTreeItem.site;
    const wizardContext: ManagedIdentityAssignContext = {
        ...context,
        site,
        managedIdentity: node.identity,
        ...node.subscription,
        ...(await createActivityContext())
    }

    await context.ui.showWarningMessage(
        localize('unassignManagedIdentityWarning', "'{0}' will not be able to request access tokens for the user assigned managed identity '{1}'. Do you want to continue?",
            site?.fullName,
            node.identity.name),
        { modal: true },
        DialogResponses.yes
    );

    const title: string = localize('assignManagedIdentity', 'Unassign User Assigned Identity to Function App');
    const wizard: AzureWizard<ManagedIdentityAssignContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps: [],
        executeSteps: [
            new ManagedIdentityUnassignStep()
        ],
        showLoadingPrompt: true
    });


    await wizard.prompt();
    wizardContext.activityTitle = localize('assigning', 'Unassign user assigned identity from "{0}"', wizardContext.site?.fullName);
    await node.runWithTemporaryDescription(context, localize('unassigning', 'Unassigning identity...'), async () => {
        await wizard.execute();
    });

    void slotTreeItem.refresh(context)
}
