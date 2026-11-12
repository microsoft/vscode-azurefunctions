/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as process from 'process';
import * as vscode from 'vscode';
import { findPollingConnectorBindings } from '../../../connectorTrigger/connectorTriggerBindings';
import { func } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { getConnectorHostLaunchBroker, tryGetConnectorHostLaunchBroker } from './ConnectorHostLaunchBroker';
import { electronRunAsNodeVariable } from './connectorHostLaunchProtocol';

export interface ConnectorHostLaunchWrapper {
    /** VS Code's executable, run as Node. */
    executable: string;
    launcherPath: string;
    /** Variables to add to the task environment. Contains the activation key: never log it. */
    environment: Record<string, string>;
}

/**
 * Returns how to start Core Tools through the Connector host launcher, or undefined when the project
 * has no polling Connector Trigger, so other projects keep their existing task unchanged.
 */
export async function getConnectorHostLaunchWrapper(projectPath: string | undefined): Promise<ConnectorHostLaunchWrapper | undefined> {
    if (!projectPath) {
        return undefined;
    }
    try {
        const launcherPath = ext.context.asAbsolutePath('dist/connectorHostLauncher.js');
        if (!await AzExtFsExtra.pathExists(launcherPath) || (await findPollingConnectorBindings(projectPath)).length === 0) {
            return undefined;
        }
        const broker = getConnectorHostLaunchBroker();
        await broker.ensureListening();
        return {
            executable: process.execPath,
            launcherPath,
            environment: { ...broker.getLaunchEnvironment(), [electronRunAsNodeVariable]: '1' },
        };
    } catch {
        // Without the launcher, Connector setup stays blocked for this task.
        return undefined;
    }
}

/** Whether the task is a built-in func task that starts Core Tools through this activation's launcher. */
export function isConnectorHostLaunchTask(task: vscode.Task): boolean {
    const broker = tryGetConnectorHostLaunchBroker();
    const execution = task.execution;
    if (!broker || task.definition.type !== func || !(execution instanceof vscode.ShellExecution) || !broker.isLaunchEnvironment(execution.options?.env)) {
        return false;
    }
    const launcherPath = ext.context.asAbsolutePath('dist/connectorHostLauncher.js');
    if (execution.commandLine !== undefined) {
        return execution.commandLine.includes(launcherPath);
    }
    const command = typeof execution.command === 'string' ? execution.command : execution.command?.value;
    const firstArg = execution.args?.[0];
    return command === process.execPath && (typeof firstArg === 'string' ? firstArg : firstArg?.value) === launcherPath;
}
