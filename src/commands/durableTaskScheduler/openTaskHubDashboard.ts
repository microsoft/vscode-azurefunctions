/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { openUrl, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskHubResourceModel } from "../../tree/durableTaskScheduler/DurableTaskHubResourceModel";

export async function openTaskHubDashboard(_: IActionContext, taskHub: DurableTaskHubResourceModel | undefined): Promise<void> {
    if (!taskHub) {
        throw new Error('No task hub was selected.');
    }

    await openUrl(taskHub?.dashboardUrl.toString(/* skipEncoding: */ true));
}
