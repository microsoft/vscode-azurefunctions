/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extensions, type DebugConfiguration, type Extension, type WorkspaceFolder } from 'vscode';
import { hostStartTaskName, localhost } from '../constants';
import { localize } from '../localize';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';

export const defaultPythonDebugHost: string = 'localhost';
export const defaultPythonDebugPort: number = 9091;

export const pythonDebugConfig: DebugConfiguration = {
    name: localize('attachPython', 'Attach to Python Functions'),
    type: 'debugpy',
    request: 'attach',
    connect: {
        host: defaultPythonDebugHost,
        port: defaultPythonDebugPort
    },
    preLaunchTask: hostStartTaskName
};

export class PythonDebugProvider extends FuncDebugProviderBase {
    public readonly workerArgKey: string = 'languageWorkers__python__arguments';
    protected readonly defaultPortOrPipeName: number = defaultPythonDebugPort;
    protected readonly debugConfig: DebugConfiguration = pythonDebugConfig;

    public async getWorkerArgValue(folder: WorkspaceFolder): Promise<string> {
        const port: number = <number>this.getDebugPortOrPipeName(folder);
        return await getPythonCommand(localhost, port);
    }
}

async function getPythonCommand(host: string, port: number): Promise<string> {
    const pyExtensionId: string = 'ms-python.python';
    const pyExtension: Extension<IPythonExtensionApi> | undefined = extensions.getExtension<IPythonExtensionApi>(pyExtensionId);
    if (pyExtension) {
        if (!pyExtension.isActive) {
            await pyExtension.activate();
        }

        if (pyExtension.exports && pyExtension.exports.debug) {
            return (await pyExtension.exports.debug.getRemoteLauncherCommand(host, port, false)).join(' ');
        } else {
            throw new Error(localize('pyExtOutOfDate', 'You must update extension with id "{0}" to debug Python projects.', pyExtensionId));
        }
    } else {
        throw new Error(localize('noPyExt', 'You must install extension with id "{0}" to debug Python projects.', pyExtensionId));
    }
}
