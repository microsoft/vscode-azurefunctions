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

export function deleteSchedulerCommandFactory(dataBranchProvider: DurableTaskSchedulerDataBranchProvider, schedulerClient: DurableTaskSchedulerClient) {
    return async (actionContext: IActionContext, scheduler: DurableTaskSchedulerResourceModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        const deleteItem: MessageItem = {
            title: 'Delete'
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
            await schedulerClient.deleteScheduler(
                scheduler.subscription,
                scheduler.resourceGroup,
                scheduler.name
            );
        }
        finally {
            dataBranchProvider.refresh();
        }
    }
}
