import { openUrl, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskHubResourceModel } from "../../tree/durableTaskScheduler/DurableTaskHubResourceModel";

export async function openTaskHubDashboard(_: IActionContext, __: DurableTaskHubResourceModel | undefined): Promise<void> {
    if (!__) {
        return;
    }

    await openUrl(__?.dashboardUrl.toString(/* skipEncoding: */ true));
}
