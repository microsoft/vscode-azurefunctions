/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type DurableTaskSchedulerEmulatorWorkspaceResourceModel } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorWorkspaceResourceModel";
import { type DurableTaskSchedulerEmulatorClient } from "../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient";
import { localize } from "../../localize";

export function stopEmulatorCommandFactory(emulatorClient: DurableTaskSchedulerEmulatorClient) {
    return async (_: IActionContext, emulator: DurableTaskSchedulerEmulatorWorkspaceResourceModel | undefined) => {
        if (!emulator) {
            throw new Error(localize('noEmulatorSelected', 'No emulator was selected.'));
        }

        await emulatorClient.stopEmulator(emulator.id);
    };
}
