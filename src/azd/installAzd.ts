/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as os from 'os';
import * as path from 'path';
import { type MessageItem } from 'vscode';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';

export enum AzdPackageManager {
    winget = 'winget',
    brew = 'brew',
}

const azdBrewTap = 'azure/azd';
export const azdLinuxInstallCommand = 'curl -fsSL https://aka.ms/install-azd.sh | bash';

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
 * Installs or updates the Azure Developer CLI with the first available package manager.
 */
export async function installAzd(context: IActionContext, packageManagers: AzdPackageManager[], update: boolean): Promise<void> {
    ext.outputChannel.show();
    switch (packageManagers[0]) {
        case AzdPackageManager.winget:
            lastAzdInstallCommand = ['winget', update ? 'upgrade' : 'install', '--id', 'Microsoft.Azd', '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements'];
            break;
        case AzdPackageManager.brew:
            await ensureAzdBrewTapTrusted(context);
            lastAzdInstallCommand = ['brew', update ? 'upgrade' : 'install', 'azd'];
            break;
        default:
            throw new RangeError(localize('invalidAzdPackageManager', 'Invalid package manager "{0}".', String(packageManagers[0])));
    }
    const executable = packageManagerExecutables.get(packageManagers[0]) ?? lastAzdInstallCommand[0];
    await cpUtils.executeCommand(ext.outputChannel, undefined, executable, composeArgs(withArg(...lastAzdInstallCommand.slice(1)))());
}

async function ensureAzdBrewTapTrusted(context: IActionContext): Promise<void> {
    const trust: MessageItem = { title: localize('trustTap', 'Trust') };
    await context.ui.showWarningMessage(
        localize('trustAzdBrewTap', 'Installing the Azure Developer CLI requires tapping the "{0}" Homebrew repository. Only continue if you trust the maintainers of "{0}".', azdBrewTap),
        { modal: true },
        trust,
    );
    await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', composeArgs(withArg('tap', azdBrewTap))());
}
