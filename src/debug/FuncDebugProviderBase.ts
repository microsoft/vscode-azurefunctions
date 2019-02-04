/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DebugConfiguration, DebugConfigurationProvider, ShellExecution, WorkspaceFolder } from 'vscode';
import { isFunctionProject } from '../commands/createNewProject/isFunctionProject';
import { hostStartTaskName } from '../constants';
import { validateFuncCoreToolsInstalled } from '../funcCoreTools/validateFuncCoreToolsInstalled';

export abstract class FuncDebugProviderBase implements DebugConfigurationProvider {
    protected abstract defaultPort: number;
    protected abstract debugConfig: DebugConfiguration;

    private readonly _debugPorts: Map<WorkspaceFolder | undefined, number | undefined> = new Map();

    public abstract getShellExecution(folder: WorkspaceFolder): Promise<ShellExecution>;

    public async provideDebugConfigurations(folder: WorkspaceFolder | undefined, _token?: CancellationToken): Promise<DebugConfiguration[]> {
        const result: DebugConfiguration[] = [];
        if (folder) {
            if (await isFunctionProject(folder.uri.fsPath)) {
                result.push(this.debugConfig);
            }
        }

        return result;
    }

    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, _token?: CancellationToken): Promise<DebugConfiguration | undefined> {
        this._debugPorts.set(folder, <number | undefined>debugConfiguration.port);
        if (debugConfiguration.preLaunchTask === hostStartTaskName) {
            if (!await validateFuncCoreToolsInstalled()) {
                return undefined;
            }
        }

        return debugConfiguration;
    }

    protected getDebugPort(folder: WorkspaceFolder): number {
        // tslint:disable-next-line:strict-boolean-expressions
        return this._debugPorts.get(folder) || this.defaultPort;
    }
}
