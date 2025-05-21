/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type DurableTaskSchedulerResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerResourceModel";
import { localize } from "../../localize";
import { ext } from "../../extensionVariables";
import { env, QuickPickItemKind, type QuickPickItem } from "vscode";

export function copySchedulerConnectionStringCommandFactory(schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, scheduler: DurableTaskSchedulerResourceModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        const { endpointUrl } = scheduler;

        const noAuthentication: QuickPickItem = {
            detail: localize('noAuthenticationDetail', 'No credentials will be used.'),
            label: localize('noAuthenticationLabel', 'None')
        }

        const localDevelopment: QuickPickItem = {
            detail: localize('localDevelopmentDetail', 'Use the credentials of the local developer.'),
            label: localize('localDevelopmentLabel', 'Local development')
        };

        const userAssignedManagedIdentity: QuickPickItem = {
            detail: localize('userAssignedManagedIdentityDetail', 'Use managed identity credentials for a specific client.'),
            label: localize('userAssignedManagedIdentityLabel', 'User-assigned managed identity')
        }

        const systemAssignedManagedIdentity: QuickPickItem = {
            detail: localize('systemAssignedManagedIdentityDetail', 'Use managed identity credentials for a client assigned to a specific Azure resource.'),
            label: localize('systemAssignedManagedIdentityLabel', 'System-assigned managed identity')
        }

        const result = await actionContext.ui.showQuickPick(
            [
                noAuthentication,
                localDevelopment,
                userAssignedManagedIdentity,
                systemAssignedManagedIdentity
            ],
            {
                canPickMany: false,
                placeHolder: localize('authenticationTypePlaceholder', 'Select the credentials to be used to connect to the scheduler')
            });

        let connectionString = `Endpoint=${endpointUrl};Authentication=`

        if (result === noAuthentication) {
            connectionString += 'None';
        }
        else if (result === localDevelopment) {
            connectionString += 'DefaultAzure';
        }
        else {
            connectionString += 'ManagedIdentity';

            if (result === userAssignedManagedIdentity) {
                connectionString += ';ClientID=<ClientID>';
            }
        }

        const taskHubs = await schedulerClient.getSchedulerTaskHubs(
            scheduler.subscription,
            scheduler.resourceGroup,
            scheduler.name);

        if (taskHubs.length > 0) {

            const noTaskHubItem: QuickPickItem = {
                    detail: localize('noTaskHubDetail', 'Do not connect to a specific task hub.'),
                    label: localize('noTaskHubLabel', 'None')
                }

            const taskHubItems: QuickPickItem[] =
                taskHubs.map(taskHub => ({ label: taskHub.name }));

            const taskHubResult = await actionContext.ui.showQuickPick(
                [
                    noTaskHubItem,
                    {
                        kind: QuickPickItemKind.Separator,
                        label: localize('taskHubSepratorLabel', 'Task Hubs')
                    },
                    ...taskHubItems
                ],
                {
                    canPickMany: false,
                    placeHolder: localize('taskHubSelectionPlaceholder', 'Select a task hub to connect to')
                });

            if (taskHubResult && taskHubResult !== noTaskHubItem) {
                connectionString += `;TaskHub=${taskHubResult.label}`;
            }
        }

        await env.clipboard.writeText(connectionString);

        ext.outputChannel.show();
        ext.outputChannel.appendLog(localize('schedulerConnectionStringCopiedMessage', 'Connection string copied to clipboard: {0}', connectionString));
    }
}
