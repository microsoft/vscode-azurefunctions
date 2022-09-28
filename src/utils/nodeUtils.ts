/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from './cpUtils';

export namespace nodeUtils {
    export const npmCommand: string = 'npm';

    export async function installDependencies(path: string): Promise<void> {
        try {
            await cpUtils.executeCommand(ext.outputChannel, path, npmCommand, 'install');
        } catch {
            ext.outputChannel.appendLog(localize('npmInstallFailure', 'WARNING: Failed to install packages in your workspace. Run "npm install" manually instead.'));
        }
    }
}
