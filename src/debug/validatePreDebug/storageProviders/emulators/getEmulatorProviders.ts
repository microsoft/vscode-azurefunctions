/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageType } from "../../../../constants";
import { IPreDebugValidateContext } from "../../IPreDebugValidateContext";
import { AzuriteEmulatorProvider } from "./AzuriteEmulatorProvider";
import { DTSEmulatorProvider } from "./DTSEmulatorProvider";
import { NetheriteEmulatorProvider } from "./EventHubsEmulatorProvider";
import { IEmulatorProvider } from "./IEmulatorProvider";

export function getEmulatorProviders(context: IPreDebugValidateContext): IEmulatorProvider<IPreDebugValidateContext>[] {
    const providers: IEmulatorProvider<IPreDebugValidateContext>[] = [];

    if (context.durableStorageType === StorageType.DTS) {
        providers.push(new DTSEmulatorProvider());
    }

    if (context.durableStorageType === StorageType.Netherite) {
        providers.push(new NetheriteEmulatorProvider());
    }

    // Storage emulator is always relevant
    providers.push(new AzuriteEmulatorProvider());

    return providers;
}
