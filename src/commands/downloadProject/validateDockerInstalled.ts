/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cpUtils } from "../../utils/cpUtils";

/**
 * Function that checks if Docker is installed on the system or remote container
 * @returns true/false boolean checking if Docker is installed
 */
export async function validateDockerInstalled(): Promise<boolean> {
    let installed: boolean = false;

    try {
        await cpUtils.executeCommand(undefined, undefined, 'docker', '--version');
        installed = true;
    } catch (error) {
        installed = false;
    }

    return installed;
}
