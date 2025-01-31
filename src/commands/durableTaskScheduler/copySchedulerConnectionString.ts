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

        const schedulerJson = schedulerClient.getScheduler(
            scheduler.subscription,
            scheduler.resourceGroup,
            scheduler.name);

        const { endpoint } = (await schedulerJson).properties;

        const localDevelopment: QuickPickItem = {
            label: localize('localDevelopmentLabel', 'Local development')
        };

        const userAssignedManagedIdentity: QuickPickItem = {
            label: localize('userAssignedManagedIdentityLabel', 'User-assigned managed identity')
        }

        const systemAssignedManagedIdentity: QuickPickItem = {
            label: localize('systemAssignedManagedIdentityLabel', 'System-assigned managed identity')
        }

        const result = await actionContext.ui.showQuickPick(
            [
                localDevelopment,
                userAssignedManagedIdentity,
                systemAssignedManagedIdentity
            ],
            {
                canPickMany: false,
                placeHolder: localize('authenticationTypePlaceholder', 'Select the type of authentication to be used')
            });

        let connectionString = `Endpoint=${endpoint};Authentication=`

        if (result === localDevelopment) {
            connectionString += 'DefaultAzure';
        }
        else {
            connectionString += 'ManagedIdentity';

            if (result === userAssignedManagedIdentity) {
                connectionString += ';ClientID=<ClientID>';
            }
        }

        // TODO: Prompt for (optional) task hub

        const taskHubs = await schedulerClient.getSchedulerTaskHubs(
            scheduler.subscription,
            scheduler.resourceGroup,
            scheduler.name);

        if (taskHubs.length > 0) {

            const noTaskHubItem: QuickPickItem = {
                    label: localize('noTaskHubLabel', 'No task hub')
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
                    placeHolder: localize('taskHubSelectionPlaceholder', 'Select the task hub')
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
