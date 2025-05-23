/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { openUrl, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from '../../localize';
import { type DurableTaskSchedulerDashboardModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerDashboardModel";

export async function openTaskHubDashboard(_: IActionContext, taskHub: DurableTaskSchedulerDashboardModel | undefined): Promise<void> {
    if (!taskHub) {
        throw new Error(localize('noTaskHubSelectedErrorMessage', 'No task hub was selected.'));
    }

    await openUrl(taskHub?.dashboardUrl.toString(/* skipEncoding: */ true));
}
