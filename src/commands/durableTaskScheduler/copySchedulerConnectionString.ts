/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type DurableTaskSchedulerResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerResourceModel";
import { localize } from "../../localize";
import { ext } from "../../extensionVariables";
import { env, type QuickPickItem } from "vscode";

export function copySchedulerConnectionStringCommandFactory(schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, scheduler: DurableTaskSchedulerResourceModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        // TODO: Prompt for type of connection string (local development, user-assigned managed identity, server-assigned managed identity)

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
                canPickMany: false
            });

        // TODO: Prompt for (optional) task hub

        const schedulerJson = schedulerClient.getScheduler(
            scheduler.subscription,
            scheduler.resourceGroup,
            scheduler.name);

        const { endpoint } = (await schedulerJson).properties;

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

        await env.clipboard.writeText(connectionString);

        ext.outputChannel.show();
        ext.outputChannel.appendLog(localize('schedulerConnectionStringCopiedMessage', 'Connection string copied to clipboard: {0}', connectionString));
    }
}
