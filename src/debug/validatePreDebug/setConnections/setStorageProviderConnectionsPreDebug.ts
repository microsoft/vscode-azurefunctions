/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageType } from "../../../constants";
import { durableUtils } from "../../../utils/durableUtils";
import { type IPreDebugValidateContext } from "../IPreDebugValidateContext";
import { setDTSConnectionPreDebugIfNeeded } from "./setDTSConnectionPreDebug";
import { setNetheriteConnectionPreDebugIfNeeded } from "./setNetheriteConnectionPreDebug";
import { setSQLConnectionPreDebugIfNeeded } from "./setSQLConnectionPreDebug";
import { setStorageConnectionPreDebugIfNeeded } from "./setStorageConnectionPreDebug";

/**
 * Prompt and configure storage provider connections.
 * Emulator work is deferred to `preDebugValidate`.
 */
export async function setStorageProviderConnectionsPreDebugIfNeeded(context: IPreDebugValidateContext): Promise<void> {
    context.durableStorageType = await durableUtils.getStorageTypeFromWorkspace(context.projectLanguage, context.projectPath);
    context.telemetry.properties.durableStorageType = context.durableStorageType;

    switch (context.durableStorageType) {
        case StorageType.DTS:
            context.telemetry.properties.lastValidateStep = 'dtsConnection';
            context.dtsConnectionType = await setDTSConnectionPreDebugIfNeeded({ ...context }, context.projectPath);
            break;
        case StorageType.Netherite:
            context.telemetry.properties.lastValidateStep = 'netheriteConnection';
            context.eventHubsConnectionType = await setNetheriteConnectionPreDebugIfNeeded({ ...context }, context.projectPath);
            break;
        case StorageType.SQL:
            context.telemetry.properties.lastValidateStep = 'sqlDbConnection';
            context.sqlDbConnectionType = await setSQLConnectionPreDebugIfNeeded({ ...context }, context.projectPath);
            break;
        case StorageType.Storage:
        default:
    }

    context.telemetry.properties.lastValidateStep = 'azureWebJobsStorage';
    context.azureWebJobsStorageType = await setStorageConnectionPreDebugIfNeeded({ ...context }, context.projectPath);
}
