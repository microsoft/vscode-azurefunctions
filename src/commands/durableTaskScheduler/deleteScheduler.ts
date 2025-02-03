/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { localize } from "../../localize";
import { type MessageItem } from "vscode";
import { type DurableTaskSchedulerResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerResourceModel";
import { type DurableTaskSchedulerDataBranchProvider } from "../../tree/durableTaskScheduler/DurableTaskSchedulerDataBranchProvider";
import { withCancellation } from "../../utils/cancellation";
import { withAzureActivity } from "../../utils/AzureActivity";

export function deleteSchedulerCommandFactory(
    dataBranchProvider: DurableTaskSchedulerDataBranchProvider,
    schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, scheduler: DurableTaskSchedulerResourceModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        const deleteItem: MessageItem = {
            title: localize('deleteSchedulerLabel', 'Delete')
        };

        const result = await actionContext.ui.showWarningMessage(
            localize('deleteSchedulerConfirmationMessage', 'Are you sure you want to delete scheduler \'{0}\'?', scheduler.name),
            {
                modal: true
            },
            deleteItem
        );

        if (result !== deleteItem) {
            return;
        }

        try {
            await withAzureActivity(
                localize('deletingSchedulerActivityLabel', 'Delete Durable Task Scheduler \'{0}\'', scheduler.name),
                async () => {
                    const response = await schedulerClient.deleteScheduler(
                        scheduler.subscription,
                        scheduler.resourceGroup,
                        scheduler.name
                    );

                    const result = await withCancellation(token => response.waitForCompletion(token), 1000 * 60 * 30);

                    if (result !== true) {
                        throw new Error(localize('deleteFailureMessage', 'The scheduler failed to delete within the allotted time.'));
                    }
                });
        }
        finally {
            dataBranchProvider.refresh();
        }
    }
}
