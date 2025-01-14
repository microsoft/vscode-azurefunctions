import { type IActionContext } from "@microsoft/vscode-azext-utils";
import {type DurableTaskHubResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerDataBranchProvider";

export async function openTaskHubDashboard(_: IActionContext, __: DurableTaskHubResourceModel | undefined): Promise<void> {
    await Promise.resolve();
}
