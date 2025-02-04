import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerEmulatorClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient";

export function startEmulatorCommandFactory(emulatorClient: DurableTaskSchedulerEmulatorClient) {
    return async (_: IActionContext) => {
        await emulatorClient.startEmulator();
    };
}
