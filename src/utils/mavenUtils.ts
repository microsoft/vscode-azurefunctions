/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cpUtils } from './cpUtils';

export namespace mavenUtils {
    const mvnCommand: string = 'mvn';
    export async function isMavenInstalled(workingDirectory: string): Promise<boolean> {
        try {
            await cpUtils.executeCommand(undefined, workingDirectory, mvnCommand, '--version');
            return true;
        } catch {
            return false;
        }
    }
}
