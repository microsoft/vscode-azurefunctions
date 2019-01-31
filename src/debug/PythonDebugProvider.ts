/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration, Extension, extensions, ShellExecution, ShellExecutionOptions, WorkspaceFolder } from 'vscode';
import { funcHostStartCommand, hostStartTaskName, localhost } from '../constants';
import { localize } from '../localize';
import { venvUtils } from '../utils/venvUtils';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';

export const defaultPythonDebugPort: number = 9091;

export const pythonDebugConfig: DebugConfiguration = {
    name: localize('attachPython', 'Attach to Python Functions'),
    type: 'python',
    request: 'attach',
    port: defaultPythonDebugPort,
    preLaunchTask: hostStartTaskName
};

export class PythonDebugProvider extends FuncDebugProviderBase {
    protected readonly defaultPort: number = defaultPythonDebugPort;
    protected readonly debugConfig: DebugConfiguration = pythonDebugConfig;

    public async getShellExecution(folder: WorkspaceFolder): Promise<ShellExecution> {
        const command: string = venvUtils.convertToVenvTask(folder, funcHostStartCommand);
        const port: number = this.getDebugPort(folder);
        const options: ShellExecutionOptions = { env: { languageWorkers__python__arguments: await getPythonCommand(localhost, port) } };
        return new ShellExecution(command, options);
    }
}

async function getPythonCommand(host: string, port: number): Promise<string> {
    const pyExtensionId: string = 'ms-python.python';
    const pyExtension: Extension<IPythonExtensionApi> | undefined = extensions.getExtension<IPythonExtensionApi>(pyExtensionId);
    if (pyExtension) {
        if (!pyExtension.isActive) {
            await pyExtension.activate();
        }

        // tslint:disable-next-line:strict-boolean-expressions
        if (pyExtension.exports && pyExtension.exports.debug) {
            return (await pyExtension.exports.debug.getRemoteLauncherCommand(host, port)).join(' ');
        } else {
            throw new Error(localize('pyExtOutOfDate', 'You must update extension with id "{0}" to debug Python projects.', pyExtensionId));
        }
    } else {
        throw new Error(localize('noPyExt', 'You must install extension with id "{0}" to debug Python projects.', pyExtensionId));
    }
}
