/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { localize } from "../../localize";
import { type DurableTaskHubResourceModel } from "../../tree/durableTaskScheduler/DurableTaskHubResourceModel";
import { type MessageItem } from "vscode";

export function deleteTaskHubCommandFactory(schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, taskHub: DurableTaskHubResourceModel | undefined): Promise<void> => {
        if (!taskHub) {
            throw new Error(localize('noTaskHubSelectedErrorMessage', 'No task hub was selected.'));
        }

        const deleteItem: MessageItem = {
            title: 'Delete'
        };

        const result = await actionContext.ui.showWarningMessage(
            localize('deleteTaskHubConfirmationMessage', 'Are you sure you want to delete task hub \'{0}\'?', taskHub.name),
            {
                modal: true
            },
            deleteItem
        );

        if (result !== deleteItem) {
            return;
        }

        try {
            await schedulerClient.deleteTaskHub(
                taskHub.scheduler.subscription,
                taskHub.scheduler.resourceGroup,
                taskHub.scheduler.name,
                taskHub.name
            );
        }
        finally {
            taskHub.scheduler.refresh();
        }
    }
}
