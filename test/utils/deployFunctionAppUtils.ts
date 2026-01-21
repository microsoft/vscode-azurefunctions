/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend } from "../../extension.bundle";

export namespace deployFunctionAppUtils {
    export function generateDurableDeployInputs(_appName: string, storageType?: DurableBackend): (string | RegExp)[] {
        switch (storageType) {
            // case DurableBackend.DTS:
            // case DurableBackend.Netherite:
            // case DurableBackend.SQL:
            case DurableBackend.Storage:
            default:
                return [
                    'Deploy',
                ];
        }
    }
}
