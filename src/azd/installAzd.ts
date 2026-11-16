/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import { randomUUID } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';

export enum AzdPackageManager {
    winget = 'winget',
    brew = 'brew',
}

const azdBrewTap = 'azure/azd';
export const azdLinuxInstallCommand = 'curl -fsSL https://aka.ms/install-azd.sh | bash -s -- --no-telemetry';

export let lastAzdInstallCommand: string[] = [];

const packageManagerExecutables = new Map<AzdPackageManager, string>();

export async function getAzdPackageManagers(): Promise<AzdPackageManager[]> {
    const candidate = process.platform === 'win32' ? AzdPackageManager.winget :
        process.platform === 'darwin' ? AzdPackageManager.brew :
            undefined;
    if (candidate) {
        for (const executable of getPackageManagerExecutables(candidate)) {
            const result = await cpUtils.tryExecuteCommand(undefined, undefined, executable, composeArgs(withArg('--version'))()).catch(() => undefined);
            if (result?.code === 0) {
                packageManagerExecutables.set(candidate, executable);
                return [candidate];
            }
        }
    }
    return [];
}

function getPackageManagerExecutables(packageManager: AzdPackageManager): string[] {
    if (packageManager === AzdPackageManager.winget) {
        // winget is an App Execution Alias, which executable lookup on PATH does not find
        const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
        return [packageManager, path.join(localAppData, 'Microsoft', 'WindowsApps', 'winget.exe')];
    }
    return [packageManager];
}

/**
 * Installs the Azure Developer CLI with its official script, or updates it with an available package manager.
 */
export async function installAzd(context: IActionContext, packageManagers: AzdPackageManager[], update: boolean): Promise<void> {
    if (!update) {
        const windowsCommand = "$ErrorActionPreference = 'Stop'; & ([scriptblock]::Create((Invoke-RestMethod 'https://aka.ms/install-azd.ps1'))) -NoTelemetry";
        const command = process.platform === 'win32' ?
            ['powershell', '-NoProfile', '-ExecutionPolicy', 'AllSigned', '-Command', windowsCommand] :
            ['bash', '-o', 'pipefail', '-c', azdLinuxInstallCommand];
        lastAzdInstallCommand = [process.platform === 'win32' ?
            `powershell -NoProfile -ExecutionPolicy AllSigned -Command "${windowsCommand}"` :
            azdLinuxInstallCommand];
        await runAzdInstallTask(command[0], command.slice(1));
        return;
    }

    ext.outputChannel.show();
    switch (packageManagers[0]) {
        case AzdPackageManager.winget:
            lastAzdInstallCommand = ['winget', 'upgrade', '--id', 'Microsoft.Azd', '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements'];
            break;
        case AzdPackageManager.brew:
            await ensureAzdBrewTapTrusted(context);
            lastAzdInstallCommand = ['brew', 'upgrade', '--cask', 'azure/azd/azd'];
            break;
        default:
            throw new RangeError(localize('invalidAzdPackageManager', 'Invalid package manager "{0}".', String(packageManagers[0])));
    }
    const executable = packageManagerExecutables.get(packageManagers[0]) ?? lastAzdInstallCommand[0];
    await cpUtils.executeCommand(ext.outputChannel, undefined, executable, composeArgs(withArg(...lastAzdInstallCommand.slice(1)))());
}

export async function runAzdInstallTask(executable: string, args: string[]): Promise<void> {
    const id = randomUUID();
    const task = new vscode.Task(
        { type: 'azureFunctionsAzdInstall', id },
        vscode.TaskScope.Global,
        localize('installAzdTask', 'Install Azure Developer CLI'),
        'Azure Functions',
        new vscode.ProcessExecution(executable, args),
        [],
    );
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, focus: true, panel: vscode.TaskPanelKind.New, clear: false };

    let processListener: vscode.Disposable | undefined;
    let taskListener: vscode.Disposable | undefined;
    const finished = new Promise<number | undefined>(resolve => {
        processListener = vscode.tasks.onDidEndTaskProcess(event => {
            if (event.execution.task.definition.id === id) {
                resolve(event.exitCode);
            }
        });
        taskListener = vscode.tasks.onDidEndTask(event => {
            if (event.execution.task.definition.id === id) {
                resolve(undefined);
            }
        });
    });
    try {
        await vscode.tasks.executeTask(task);
        const exitCode = await finished;
        if (exitCode !== 0) {
            throw new Error(localize('azdInstallTaskFailed', 'Azure Developer CLI installation did not complete successfully. Check the terminal for details.'));
        }
    } finally {
        processListener?.dispose();
        taskListener?.dispose();
    }
}

async function ensureAzdBrewTapTrusted(context: IActionContext): Promise<void> {
    const trust: vscode.MessageItem = { title: localize('trustTap', 'Trust') };
    await context.ui.showWarningMessage(
        localize('trustAzdBrewTap', 'Installing the Azure Developer CLI requires tapping the "{0}" Homebrew repository. Only continue if you trust the maintainers of "{0}".', azdBrewTap),
        { modal: true },
        trust,
    );
    await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', composeArgs(withArg('trust', azdBrewTap))());
}
