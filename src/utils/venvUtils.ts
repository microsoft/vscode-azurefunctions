/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { workspace, WorkspaceConfiguration, WorkspaceFolder } from 'vscode';
import { Platform } from "../constants";
import { ext } from '../extensionVariables';
import { getFuncExtensionSetting } from '../ProjectSettings';
import { cpUtils } from './cpUtils';

export namespace venvUtils {
    const bashAndCmdSeparator: string = ' && ';
    const powerShellSeparator: string = ' ; ';

    export function convertToVenvTask(folder: WorkspaceFolder, ...commands: string[]): string {
        const venvName: string | undefined = getFuncExtensionSetting<string>('pythonVenv', folder.uri.fsPath);
        if (venvName) {
            commands.unshift(getVenvActivateCommand(venvName));
        }

        let separator: string = bashAndCmdSeparator;
        if (process.platform === Platform.Windows) {
            const config: WorkspaceConfiguration = workspace.getConfiguration();
            const shell: string | undefined = config.get('terminal.integrated.shell.windows');
            if (shell && /(powershell|pwsh)/i.test(shell)) {
                separator = powerShellSeparator;
            }
        }

        return commands.join(separator);
    }

    export async function runPythonCommandInVenv(venvName: string, folderPath: string, command: string): Promise<void> {
        // child_process uses cmd or bash, not PowerShell
        command = getVenvActivateCommand(venvName) + bashAndCmdSeparator + command;
        await cpUtils.executeCommand(ext.outputChannel, folderPath, command);
    }

    export function getVenvActivatePath(venvName: string): string {
        switch (process.platform) {
            case Platform.Windows:
                return path.join('.', venvName, 'Scripts', 'activate');
            default:
                return path.join('.', venvName, 'bin', 'activate');
        }
    }

    function getVenvActivateCommand(venvName: string): string {
        const venvActivatePath: string = getVenvActivatePath(venvName);
        switch (process.platform) {
            case Platform.Windows:
                return venvActivatePath;
            default:
                return `. ${venvActivatePath}`;
        }
    }
}
