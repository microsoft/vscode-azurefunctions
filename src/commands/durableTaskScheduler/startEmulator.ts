/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerEmulatorClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient";

export function startEmulatorCommandFactory(emulatorClient: DurableTaskSchedulerEmulatorClient) {
    return async (_: IActionContext): Promise<string> => {
        return await emulatorClient.startEmulator();
    };
}
