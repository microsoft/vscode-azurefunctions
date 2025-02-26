/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserAssignedIdentityListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type UserAssignedIdentitiesTreeItem } from '../../tree/remoteProject/UserAssignedIdentitiesTreeItem';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { createActivityContext } from '../../utils/activityUtils';
import { pickFunctionApp } from '../../utils/pickFunctionApp';
import { type ManagedIdentityAssignContext } from './ManagedIdentityAssignContext';
import { ManagedIdentityAssignStep } from './ManagedIdentityAssignStep';

export async function assignManagedIdentity(context: IActionContext, node?: UserAssignedIdentitiesTreeItem | SlotTreeItem): Promise<SlotTreeItem> {
    if (!node) {
        node = await pickFunctionApp(context);
    } else {
        // if it's a ManagedIdentitiesTreeItem, we need to get the parent SlotTreeItem
        node = node.parent as SlotTreeItem;
    }

    const wizardContext: ManagedIdentityAssignContext = {
        ...context,
        site: node.site,
        ...node.subscription,
        ...(await createActivityContext())
    }

    const promptSteps: AzureWizardPromptStep<ManagedIdentityAssignContext>[] = [
        new UserAssignedIdentityListStep()
    ];

    const executeSteps: AzureWizardExecuteStep<ManagedIdentityAssignContext>[] = [
        new ManagedIdentityAssignStep()
    ];
    const title: string = localize('assignManagedIdentity', 'Assign Managed Identity to Function App');
    const wizard: AzureWizard<ManagedIdentityAssignContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps,
        showLoadingPrompt: true
    });


    await wizard.prompt();
    wizardContext.activityTitle = localize('assigning', 'Assigning user assigned identity "{1}" for "{0}"...', wizardContext.site?.fullName, wizardContext.managedIdentity?.name);
    await node.runWithTemporaryDescription(context, localize('enabling', 'Assigning identity...'), async () => {
        await wizard.execute();
    });

    void node.refresh(context)
    return node;
}
