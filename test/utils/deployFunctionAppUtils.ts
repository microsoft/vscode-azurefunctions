/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend } from "../../extension.bundle";

export namespace deployFunctionAppUtils {
    export function generateDurableDeployInputs(appName: string, storageType?: DurableBackend): (string | RegExp)[] {
        switch (storageType) {
            case DurableBackend.DTS:
                return [
                    // Todo: Expand regexp capability for context.ui.showWarningMessage
                    'Connect Durable Task Scheduler',
                    /Create New Durable Task Scheduler/i,
                    appName,
                    /Create New Durable Task Hub/i,
                    appName,
                    /Assign New User[- ]Assigned Identity/i,
                    /Create New User[- ]Assigned Identity/i,
                    // Todo: Here too
                    'Deploy',
                ];
            case DurableBackend.Netherite:
                return [];
            case DurableBackend.SQL:
                return [];
            case DurableBackend.Storage:
            default:
                return [];
        }
    }
}
