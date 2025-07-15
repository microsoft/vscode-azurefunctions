/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { env, QuickPickItemKind, type QuickPickItem } from "vscode";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type DurableTaskSchedulerResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerResourceModel";

export enum SchedulerAuthenticationType {
    None,
    Local,
    SystemAssignedIdentity,
    UserAssignedIdentity,
}

export function copySchedulerConnectionStringCommandFactory(schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, scheduler: DurableTaskSchedulerResourceModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        const { endpointUrl } = scheduler;

        const noAuthentication: IAzureQuickPickItem<SchedulerAuthenticationType> = {
            detail: localize('noAuthenticationDetail', 'No credentials will be used.'),
            label: localize('noAuthenticationLabel', 'None'),
            data: SchedulerAuthenticationType.None,
        }

        const localDevelopment: IAzureQuickPickItem<SchedulerAuthenticationType> = {
            detail: localize('localDevelopmentDetail', 'Use the credentials of the local developer.'),
            label: localize('localDevelopmentLabel', 'Local development'),
            data: SchedulerAuthenticationType.Local,
        };

        const userAssignedManagedIdentity: IAzureQuickPickItem<SchedulerAuthenticationType> = {
            detail: localize('userAssignedManagedIdentityDetail', 'Use managed identity credentials for a specific client.'),
            label: localize('userAssignedManagedIdentityLabel', 'User-assigned managed identity'),
            data: SchedulerAuthenticationType.UserAssignedIdentity,
        }

        const systemAssignedManagedIdentity: IAzureQuickPickItem<SchedulerAuthenticationType> = {
            detail: localize('systemAssignedManagedIdentityDetail', 'Use managed identity credentials for a client assigned to a specific Azure resource.'),
            label: localize('systemAssignedManagedIdentityLabel', 'System-assigned managed identity'),
            data: SchedulerAuthenticationType.SystemAssignedIdentity,
        }

        const authenticationType = (await actionContext.ui.showQuickPick(
            [
                noAuthentication,
                localDevelopment,
                userAssignedManagedIdentity,
                systemAssignedManagedIdentity
            ],
            {
                canPickMany: false,
                placeHolder: localize('authenticationTypePlaceholder', 'Select the credentials to be used to connect to the scheduler')
            })).data;

        let connectionString = getSchedulerConnectionString(endpointUrl ?? '', authenticationType);

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

export const clientIdKey: string = '<ClientID>';

export function getSchedulerConnectionString(endpointUrl: string, authenticationType: SchedulerAuthenticationType): string {
    let schedulerConnectionString = `Endpoint=${endpointUrl};Authentication=`

    if (authenticationType === SchedulerAuthenticationType.None) {
        schedulerConnectionString += 'None';
    }
    else if (authenticationType === SchedulerAuthenticationType.Local) {
        schedulerConnectionString += 'DefaultAzure';
    }
    else {
        schedulerConnectionString += 'ManagedIdentity';

        if (authenticationType === SchedulerAuthenticationType.UserAssignedIdentity) {
            schedulerConnectionString += `;ClientID=${clientIdKey}`;
        }
    }

    return schedulerConnectionString;
}
