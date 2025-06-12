/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { env, QuickPickItemKind, type QuickPickItem } from "vscode";
import { localize } from "../../localize";
import { ext } from "../../extensionVariables";
import { type DurableTaskSchedulerEmulatorWorkspaceResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorWorkspaceResourceModel";

export function copyEmulatorConnectionStringCommandFactory() {
    return async (actionContext: IActionContext, scheduler: DurableTaskSchedulerEmulatorWorkspaceResourceModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        const { endpointUrl } = scheduler;

        let connectionString = `Endpoint=${endpointUrl};Authentication=None`;

        const taskHubs = scheduler.taskHubs;

        if (taskHubs.length > 0) {

            const noTaskHubItem: QuickPickItem = {
                    detail: localize('noTaskHubDetail', 'Do not connect to a specific task hub.'),
                    label: localize('noTaskHubLabel', 'None')
                }

            const taskHubItems: QuickPickItem[] =
                taskHubs.map(taskHub => ({ label: taskHub }));

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
