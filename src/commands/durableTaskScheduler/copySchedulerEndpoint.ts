/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { ext } from "../../extensionVariables";
import { env } from "vscode";
import { type DurableTaskSchedulerEndpointModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEndpointModel";

export function copySchedulerEndpointCommandFactory() {
    return async (_: IActionContext, scheduler: DurableTaskSchedulerEndpointModel | undefined): Promise<void> => {
        if (!scheduler) {
            throw new Error(localize('noSchedulerSelectedErrorMessage', 'No scheduler was selected.'));
        }

        const { endpointUrl } = scheduler;

        await env.clipboard.writeText(endpointUrl.toString());

        ext.outputChannel.show();
        ext.outputChannel.appendLog(localize('schedulerEndpointCopiedMessage', 'Endpoint copied to clipboard: {0}', endpointUrl.toString()));
    }
}
