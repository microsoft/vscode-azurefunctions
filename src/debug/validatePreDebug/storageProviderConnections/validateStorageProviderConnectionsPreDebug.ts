/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend } from "../../../constants";
import { durableUtils } from "../../../utils/durableUtils";
import { type IPreDebugValidateContext } from "../IPreDebugValidateContext";
import { validateDTSConnectionPreDebug } from "./validateDTSConnectionPreDebug";
import { validateNetheriteConnectionPreDebug } from "./validateNetheriteConnectionPreDebug";
import { validateSQLConnectionPreDebug } from "./validateSQLConnectionPreDebug";
import { validateStorageConnectionPreDebug } from "./validateStorageConnectionPreDebug";

export async function validateStorageProviderConnectionsPreDebug(context: IPreDebugValidateContext): Promise<void> {
    const durableStorageType: DurableBackend | undefined = await durableUtils.getStorageTypeFromWorkspace(context.projectLanguage, context.projectPath);
    context.telemetry.properties.durableStorageType = durableStorageType;

    switch (durableStorageType) {
        case DurableBackend.DTS:
            context.telemetry.properties.lastValidateStep = 'dtsConnection';
            await validateDTSConnectionPreDebug(context, context.projectPath);
            break;
        case DurableBackend.Netherite:
            context.telemetry.properties.lastValidateStep = 'netheriteConnection';
            await validateNetheriteConnectionPreDebug(context, context.projectPath);
            break;
        case DurableBackend.SQL:
            context.telemetry.properties.lastValidateStep = 'sqlDbConnection';
            await validateSQLConnectionPreDebug(context, context.projectPath);
            break;
        case DurableBackend.Storage:
        default:
    }

    context.telemetry.properties.lastValidateStep = 'azureWebJobsStorage';
    await validateStorageConnectionPreDebug(context, context.projectPath);
}
