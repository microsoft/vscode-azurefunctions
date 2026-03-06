/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageProviderType } from "../../../../../constants";
import { cloneWithNewActivityContext } from "../../../../../utils/activityUtils";
import { type IPreDebugValidateContext } from "../../../IPreDebugValidateContext";
import { setDTSConnectionPreDebugIfNeeded } from "./setDTSConnectionPreDebug";
import { setNetheriteConnectionPreDebugIfNeeded } from "./setNetheriteConnectionPreDebug";
import { setSQLConnectionPreDebugIfNeeded } from "./setSQLConnectionPreDebug";
import { setStorageConnectionPreDebugIfNeeded } from "./setStorageConnectionPreDebug";

export async function setStorageProviderConnectionsPreDebugIfNeeded(context: IPreDebugValidateContext): Promise<void> {
    switch (context.durableStorageType) {
        case StorageProviderType.DTS:
            context.telemetry.properties.lastValidateStep = 'dtsConnection';
            await setDTSConnectionPreDebugIfNeeded(await cloneWithNewActivityContext(context), context.projectPath);
            break;
        case StorageProviderType.Netherite:
            context.telemetry.properties.lastValidateStep = 'netheriteConnection';
            await setNetheriteConnectionPreDebugIfNeeded(await cloneWithNewActivityContext(context), context.projectPath);
            break;
        case StorageProviderType.SQL:
            context.telemetry.properties.lastValidateStep = 'sqlDbConnection';
            await setSQLConnectionPreDebugIfNeeded(await cloneWithNewActivityContext(context), context.projectPath);
            break;
        case StorageProviderType.Storage:
        default:
    }

    context.telemetry.properties.lastValidateStep = 'azureWebJobsStorage';
    await setStorageConnectionPreDebugIfNeeded(await cloneWithNewActivityContext(context), context.projectPath);
}
