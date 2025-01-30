/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type DurableTaskSchedulerResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerResourceModel";
import { localize } from "../../localize";
import { ext } from "../../extensionVariables";
import { env } from "vscode";

export function copySchedulerEndpointCommandFactory(schedulerClient: DurableTaskSchedulerClient) {
    return async (_: IActionContext, scheduler: DurableTaskSchedulerResourceModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        const schedulerJson = schedulerClient.getScheduler(
            scheduler.subscription,
            scheduler.resourceGroup,
            scheduler.name);

        const { endpoint } = (await schedulerJson).properties;

        await env.clipboard.writeText(endpoint);

        ext.outputChannel.show();
        ext.outputChannel.appendLog(localize('schedulerEndpointCopiedMessage', 'Endpoint copied to clipboard: {0}', endpoint));
    }
}
