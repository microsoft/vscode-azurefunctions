/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, callWithTelemetryAndErrorHandling, DialogResponses, setWorkflowOutcome, type IActionContext, type WorkflowTelemetryDetails } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { env, type MessageItem } from 'vscode';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { openUrl } from '../utils/openUrl';
import { azdLinuxInstallCommand, getAzdPackageManagers, installAzd, lastAzdInstallCommand } from './installAzd';

/** azd 1.33.0 added the `npipe:` and `unix:` external authentication transports. */
export const minAzdVersion = '1.33.0';
export const azdInstallUrl = 'https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd';

export interface AzdInstallation {
    version: string;
    /** Folder to add to the Functions host PATH when azd was found outside the current PATH, such as right after installing it. */
    pathDirectory?: string;
}

/**
 * Ensures the Azure Developer CLI is installed with external authentication support, offering to install or
 * update it like the Core Tools prerequisite. Returns undefined when azd remains unavailable.
 */
export async function validateAzdInstalled(context: IActionContext, message: string): Promise<AzdInstallation | undefined> {
    let installation: AzdInstallation | undefined = await findAzd();
    context.telemetry.properties.azdInstalled = String(!!installation);
    if (installation && semver.gte(installation.version, minAzdVersion)) {
        return installation;
    }

    const update = !!installation;
    let input: MessageItem | undefined;
    const install: MessageItem = { title: update ? localize('update', 'Update') : localize('install', 'Install') };
    const copyCommand: MessageItem = { title: localize('copyCommand', 'Copy command') };
    await callWithTelemetryAndErrorHandling('azureFunctions.validateAzdInstalled', async (innerContext: IActionContext) => {
        innerContext.errorHandling.suppressDisplay = true;
        innerContext.telemetry.properties.azdUpdate = String(update);
        try {
            const packageManagers = await getAzdPackageManagers();
            const items: MessageItem[] = packageManagers.length > 0 ? [install] :
                process.platform === 'linux' ? [copyCommand, DialogResponses.learnMore] : [DialogResponses.learnMore];
            const prompt = update ?
                message + ' ' + localize('azdUpdateRequired', 'Azure Developer CLI {0} or later is required; version {1} is installed.', minAzdVersion, installation?.version) :
                message;
            input = await innerContext.ui.showWarningMessage(prompt, { modal: true, stepName: 'validateAzdInstalled' }, ...items);
            innerContext.telemetry.properties.dialogResult = input.title;
            if (input === install) {
                await installAzd(innerContext, packageManagers, update);
                installation = await findAzd();
            } else if (input === copyCommand) {
                await copyToClipboard(azdLinuxInstallCommand);
            } else if (input === DialogResponses.learnMore) {
                await openUrl(azdInstallUrl);
            }
        } finally {
            if (!installation || semver.lt(installation.version, minAzdVersion)) {
                const details: WorkflowTelemetryDetails = { cancelReason: 'prerequisite', failureCategory: 'prerequisite' };
                innerContext.telemetry.properties.azdUnavailable = 'true';
                setWorkflowOutcome(innerContext, 'blocked', details);
                setWorkflowOutcome(context, 'blocked', details);
            }
        }
    });

    if (installation && semver.gte(installation.version, minAzdVersion)) {
        return installation;
    }
    if (input === install) {
        const failed = localize('failedInstallAzd', 'The Azure Developer CLI installation has failed and will have to be installed manually.');
        const result = await context.ui.showWarningMessage(failed, ...(lastAzdInstallCommand.length ? [copyCommand] : []), DialogResponses.learnMore);
        if (result === DialogResponses.learnMore) {
            await openUrl(azdInstallUrl);
        } else if (result === copyCommand) {
            await copyToClipboard(lastAzdInstallCommand.join(' '));
        }
    }
    return undefined;
}

async function copyToClipboard(command: string): Promise<void> {
    await env.clipboard.writeText(command);
    ext.outputChannel.appendLog(localize('copiedClipboard', 'Copied to clipboard: "{0}"', command));
}

/**
 * Finds azd on the current PATH, then in the folders its installers use, since VS Code keeps the PATH it started with.
 */
export async function findAzd(): Promise<AzdInstallation | undefined> {
    const onPath = await getAzdVersion('azd');
    if (onPath) {
        return { version: onPath };
    }
    for (const directory of getAzdInstallDirectories()) {
        const executable = path.join(directory, process.platform === 'win32' ? 'azd.exe' : 'azd');
        if (await AzExtFsExtra.pathExists(executable)) {
            const version = await getAzdVersion(executable);
            if (version) {
                return { version, pathDirectory: directory };
            }
        }
    }
    return undefined;
}

function getAzdInstallDirectories(): string[] {
    switch (process.platform) {
        case 'win32': {
            const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
            return [path.join(localAppData, 'Programs', 'Azure Dev CLI')];
        }
        case 'darwin':
            return ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.azd', 'bin')];
        default:
            return ['/usr/local/bin', path.join(os.homedir(), '.azd', 'bin')];
    }
}

async function getAzdVersion(executable: string): Promise<string | undefined> {
    const result = await cpUtils.tryExecuteCommand(undefined, undefined, executable, composeArgs(withArg('version', '--output', 'json'))());
    if (result.code !== 0) {
        return undefined;
    }
    try {
        const output: unknown = JSON.parse(result.cmdOutput);
        const version: unknown = (output as { azd?: { version?: unknown } } | undefined)?.azd?.version;
        return typeof version === 'string' ? semver.coerce(version)?.version : undefined;
    } catch {
        return undefined;
    }
}
