/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceManagementClient, type GenericResourceExpanded } from "@azure/arm-resources";
import { uiUtils } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { type ManagedIdentityAssignContext } from "./ManagedIdentityAssignContext";

export class ManagedIdentityPickStep extends AzureWizardPromptStep<ManagedIdentityAssignContext> {
    public hideStepCount: boolean = false;

    public async prompt(context: ManagedIdentityAssignContext): Promise<void> {
        // Get all managed identity sources
        if (context.site) {
            const resourceClient = new ResourceManagementClient(context.site.subscription.credentials, context.site.subscription.subscriptionId);
            const resources: GenericResourceExpanded[] = await uiUtils.listAllIterator(resourceClient.resources.list());
            const identities = resources.filter(resource => resource.type === 'Microsoft.ManagedIdentity/userAssignedIdentities');

            // Prompt for event source
            const identityPicks: IAzureQuickPickItem<GenericResourceExpanded>[] = identities.map((resource: GenericResourceExpanded) => {
                return {
                    label: resource.name || '',
                    data: resource || {},
                };
            });

            const chosenIdentity =
                (
                    await context.ui.showQuickPick(identityPicks, {
                        placeHolder: localize('selectedUserAssignedIdentity', 'Select the user-assigned managed identity to assigned to your app'),
                        stepName: 'identityPick',
                    })
                ).data;

            context.identityResourceId = chosenIdentity.id;
            context.identityPrincipalId = chosenIdentity.identity?.principalId;
            context.identityClientId = chosenIdentity.identity?.tenantId;
        }

    }

    public shouldPrompt(context: ManagedIdentityAssignContext): boolean {
        return !context.identityResourceId;
    }
}
