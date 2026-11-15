/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
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

export async function getAzdPackageManagers(): Promise<AzdPackageManager[]> {
    const candidate = process.platform === 'win32' ? AzdPackageManager.winget :
        process.platform === 'darwin' ? AzdPackageManager.brew :
            undefined;
    if (candidate && (await cpUtils.tryExecuteCommand(undefined, undefined, candidate, composeArgs(withArg('--version'))())).code === 0) {
        return [candidate];
    }
    return [];
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
    await cpUtils.executeCommand(ext.outputChannel, undefined, lastAzdInstallCommand[0], composeArgs(withArg(...lastAzdInstallCommand.slice(1)))());
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
