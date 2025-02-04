import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerEmulatorWorkspaceResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorWorkspaceResourceModel";
import { type DurableTaskSchedulerEmulatorClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient";

export function stopEmulatorCommandFactory(_: DurableTaskSchedulerEmulatorClient) {
    return async (__: IActionContext, ___: DurableTaskSchedulerEmulatorWorkspaceResourceModel | undefined) => {
        return Promise.resolve();
    };
}
