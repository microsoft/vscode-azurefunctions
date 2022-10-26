/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { pythonVenvSetting, requirementsFileName } from "../constants";
import { ext } from '../extensionVariables';
import { emptyWorkspace, localize } from '../localize';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { cpUtils } from './cpUtils';
import { getWorkspaceRootPath } from './workspace';

export namespace venvUtils {
    enum Terminal {
        bash,
        cmd,
        powerShell
    }

    export async function runPipInstallCommandIfPossible(venvName?: string, projectPath?: string): Promise<void> {
        venvName ??= getWorkspaceSetting(pythonVenvSetting) || '.venv';

        projectPath ??= getWorkspaceRootPath();
        if (!projectPath) {
            throw new Error(emptyWorkspace);
        }

        const venvPath: string = path.join(projectPath, <string>venvName);
        if (!AzExtFsExtra.pathExists(venvPath)) {
            return;
        }

        const requirementsPath: string = path.join(projectPath, requirementsFileName);
        if (await AzExtFsExtra.pathExists(requirementsPath)) {
            try {
                // Attempt to install packages so that users get Intellisense right away
                await runCommandInVenv(`pip install -r ${requirementsFileName}`, <string>venvName, projectPath);
            } catch {
                ext.outputChannel.appendLog(localize('pipInstallFailure', 'WARNING: Failed to install packages in your virtual environment. Run "pip install" manually instead.'));
            }
        }
    }

    export function convertToVenvCommand(command: string, folderPath: string): string {
        const terminal: Terminal = getTerminal(process.platform);
        const venvName: string | undefined = getWorkspaceSetting<string>(pythonVenvSetting, folderPath);
        if (venvName) {
            return joinCommands(terminal, getVenvActivateCommand(venvName, terminal, process.platform), command);
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
        const terminal: Terminal = process.platform === 'win32' ? Terminal.cmd : Terminal.bash;
        command = joinCommands(terminal, getVenvActivateCommand(venvName, terminal, process.platform), command);
        await cpUtils.executeCommand(ext.outputChannel, folderPath, command);
    }

    export async function venvExists(venvName: string, rootFolder: string): Promise<boolean> {
        const venvPath: string = path.join(rootFolder, venvName);
        if (await AzExtFsExtra.pathExists(venvPath)) {
            if (await AzExtFsExtra.isDirectory(venvPath)) {
                const venvActivatePath: string = getVenvPath(venvName, 'activate', process.platform, path.join);
                if (await AzExtFsExtra.pathExists(path.join(rootFolder, venvActivatePath))) {
                    return true;
                }
            }
        }
        return false;
    }

    function getTerminal(platform: NodeJS.Platform): Terminal {
        if (platform === 'win32') {
            if (/(powershell|pwsh)/i.test(vscode.env.shell)) {
                return Terminal.powerShell;
            } else if (/bash/i.test(vscode.env.shell)) {
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
        const middleFs: string = platform === 'win32' ? 'Scripts' : 'bin';
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
