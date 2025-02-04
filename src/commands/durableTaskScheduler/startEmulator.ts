import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerEmulatorClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient";

export function startEmulatorCommandFactory(_: DurableTaskSchedulerEmulatorClient) {
    return async (_: IActionContext) => {
        return Promise.resolve();
    };
}
