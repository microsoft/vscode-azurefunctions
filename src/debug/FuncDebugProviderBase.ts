/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DebugConfiguration, DebugConfigurationProvider, ShellExecution, WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { isFunctionProject } from '../commands/createNewProject/verifyIsProject';
import { hostStartTaskName } from '../constants';
import { validateFuncCoreToolsInstalled } from '../funcCoreTools/validateFuncCoreToolsInstalled';

export abstract class FuncDebugProviderBase implements DebugConfigurationProvider {
    protected abstract defaultPortOrPipeName: number | string;
    protected abstract debugConfig: DebugConfiguration;

    private readonly _debugPorts: Map<WorkspaceFolder | undefined, number | undefined> = new Map();

    public abstract getShellExecution(folder: WorkspaceFolder): Promise<ShellExecution>;

    public async provideDebugConfigurations(folder: WorkspaceFolder | undefined, _token?: CancellationToken): Promise<DebugConfiguration[]> {
        // tslint:disable-next-line: no-this-assignment
        const me: FuncDebugProviderBase = this;
        const configs: DebugConfiguration[] | undefined = await callWithTelemetryAndErrorHandling('provideDebugConfigurations', async function (this: IActionContext): Promise<DebugConfiguration[]> {
            this.properties.isActivationEvent = 'true';
            this.suppressErrorDisplay = true;
            this.suppressTelemetry = true;

            const result: DebugConfiguration[] = [];
            if (folder) {
                if (await isFunctionProject(folder.uri.fsPath)) {
                    result.push(me.debugConfig);
                }
            }

            return result;
        });

        // tslint:disable-next-line: strict-boolean-expressions
        return configs || [];
    }

    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, _token?: CancellationToken): Promise<DebugConfiguration | undefined> {
        // tslint:disable-next-line: no-this-assignment
        const me: FuncDebugProviderBase = this;
        await callWithTelemetryAndErrorHandling('resolveDebugConfiguration', async function (this: IActionContext): Promise<void> {
            this.properties.isActivationEvent = 'true';
            this.suppressErrorDisplay = true;
            this.suppressTelemetry = true;

            me._debugPorts.set(folder, <number | undefined>debugConfiguration.port);
            if (debugConfiguration.preLaunchTask === hostStartTaskName) {
                if (!await validateFuncCoreToolsInstalled()) {
                    return undefined;
                }
            }
        });

        // Always return the debugConfiguration passed in. If we return undefined we would block debugging and we don't want that.
        return debugConfiguration;
    }

    protected getDebugPortOrPipeName(folder: WorkspaceFolder): number | string {
        // tslint:disable-next-line:strict-boolean-expressions
        return this._debugPorts.get(folder) || this.defaultPortOrPipeName;
    }
}
