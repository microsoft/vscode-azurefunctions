/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend } from "../../../constants";
import { durableUtils } from "../../../utils/durableUtils";
import { type IPreDebugValidateContext } from "../IPreDebugValidateContext";
import { setDTSConnectionPreDebugIfNeeded } from "./setDTSConnectionPreDebug";
import { setNetheriteConnectionPreDebugIfNeeded } from "./setNetheriteConnectionPreDebug";
import { setSQLConnectionPreDebugIfNeeded } from "./setSQLConnectionPreDebug";
import { setStorageConnectionPreDebugIfNeeded } from "./setStorageConnectionPreDebug";

export async function setStorageProviderConnectionsPreDebugIfNeeded(context: IPreDebugValidateContext): Promise<void> {
    context.durableStorageType = await durableUtils.getStorageTypeFromWorkspace(context.projectLanguage, context.projectPath);
    context.telemetry.properties.durableStorageType = context.durableStorageType;

    switch (context.durableStorageType) {
        case DurableBackend.DTS:
            context.telemetry.properties.lastValidateStep = 'dtsConnection';
            await setDTSConnectionPreDebugIfNeeded(context, context.projectPath);
            break;
        case DurableBackend.Netherite:
            context.telemetry.properties.lastValidateStep = 'netheriteConnection';
            await setNetheriteConnectionPreDebugIfNeeded(context, context.projectPath);
            break;
        case DurableBackend.SQL:
            context.telemetry.properties.lastValidateStep = 'sqlDbConnection';
            await setSQLConnectionPreDebugIfNeeded(context, context.projectPath);
            break;
        case DurableBackend.Storage:
        default:
    }

    context.telemetry.properties.lastValidateStep = 'azureWebJobsStorage';
    await setStorageConnectionPreDebugIfNeeded(context, context.projectPath);
}
