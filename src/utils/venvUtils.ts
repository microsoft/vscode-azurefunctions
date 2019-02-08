/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { workspace, WorkspaceConfiguration } from 'vscode';
import { Platform, pythonVenvSetting } from "../constants";
import { ext } from '../extensionVariables';
import { getFuncExtensionSetting } from '../ProjectSettings';
import { cpUtils } from './cpUtils';

export namespace venvUtils {
    enum Terminal {
        bash,
        cmd,
        powerShell
    }

    export function convertToVenvCommand(command: string, folderPath: string, platform: NodeJS.Platform = process.platform): string {
        const terminal: Terminal = getTerminal(platform);
        const venvName: string | undefined = getFuncExtensionSetting<string>(pythonVenvSetting, folderPath);
        if (venvName) {
            return joinCommands(terminal, getVenvActivateCommand(venvName, terminal, platform), command);
        } else {
            return command;
        }
    }

    export function convertToVenvPythonCommand(command: string, venvName: string, platform: NodeJS.Platform): string {
        const terminal: Terminal = getTerminal(platform);
        const pythonPath: string = getVenvPath(venvName, 'python', platform, getPathJoin(terminal));
        return `${pythonPath} -m ${command}`;
    }

    export async function runCommandInVenv(command: string, venvName: string, folderPath: string): Promise<void> {
        // child_process uses cmd or bash, not PowerShell
        const terminal: Terminal = process.platform === Platform.Windows ? Terminal.cmd : Terminal.bash;
        command = joinCommands(terminal, getVenvActivateCommand(venvName, terminal, process.platform), command);
        await cpUtils.executeCommand(ext.outputChannel, folderPath, command);
    }

    export async function venvExists(venvName: string, rootFolder: string): Promise<boolean> {
        const venvPath: string = path.join(rootFolder, venvName);
        if (await fse.pathExists(venvPath)) {
            const stat: fse.Stats = await fse.stat(venvPath);
            if (stat.isDirectory()) {
                const venvActivatePath: string = getVenvPath(venvName, 'activate', process.platform, path.join);
                if (await fse.pathExists(path.join(rootFolder, venvActivatePath))) {
                    return true;
                }
            }
        }
        return false;
    }

    function getTerminal(platform: NodeJS.Platform): Terminal {
        if (platform === Platform.Windows) {
            const config: WorkspaceConfiguration = workspace.getConfiguration();
            const terminalSetting: string | undefined = config.get('terminal.integrated.shell.windows');
            if (!terminalSetting || /(powershell|pwsh)/i.test(terminalSetting)) {
                // powershell is the default if setting isn't defined
                return Terminal.powerShell;
            } else if (/bash/i.test(terminalSetting)) {
                return Terminal.bash;
            } else {
                return Terminal.cmd;
            }
        } else {
            return Terminal.bash;
        }
    }

    function getVenvActivateCommand(venvName: string, terminal: Terminal, platform: NodeJS.Platform): string {
        const venvActivatePath: string = getVenvPath(venvName, 'activate', platform, getPathJoin(terminal));
        switch (terminal) {
            case Terminal.bash:
                return `. ${venvActivatePath}`;
            default:
                return venvActivatePath;
        }
    }

    function getVenvPath(venvName: string, lastFs: string, platform: NodeJS.Platform, pathJoin: (...p: string[]) => string): string {
        const middleFs: string = platform === Platform.Windows ? 'Scripts' : 'bin';
        const paths: string[] = ['.', venvName, middleFs, lastFs];
        return pathJoin(...paths);
    }

    function getPathJoin(terminal: Terminal): (...p: string[]) => string {
        switch (terminal) {
            case Terminal.bash:
                return path.posix.join;
            default:
                return path.win32.join;
        }
    }

    function joinCommands(terminal: Terminal, ...commands: string[]): string {
        switch (terminal) {
            case Terminal.powerShell:
                return commands.join(' ; ');
            default:
                return commands.join(' && '); // bash and cmd
        }
    }
}
