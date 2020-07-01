/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DebugConfiguration, ShellExecutionOptions, WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { isFunctionProject } from '../commands/createNewProject/verifyIsProject';
import { FuncDebugProvider } from './FuncDebugProvider';

export abstract class FuncAttachDebugProviderBase extends FuncDebugProvider {
    protected abstract defaultPortOrPipeName: number | string;
    protected abstract debugConfig: DebugConfiguration;

    private readonly _debugPorts: Map<string | undefined, number | undefined> = new Map();

    public abstract getExecutionOptions(folder: WorkspaceFolder): Promise<ShellExecutionOptions>;

    public async provideDebugConfigurations(folder: WorkspaceFolder | undefined, _token?: CancellationToken): Promise<DebugConfiguration[]> {
        const configs: DebugConfiguration[] | undefined = await callWithTelemetryAndErrorHandling('provideDebugConfigurations', async (context: IActionContext) => {
            context.telemetry.properties.isActivationEvent = 'true';
            context.errorHandling.suppressDisplay = true;
            context.telemetry.suppressIfSuccessful = true;

            const result: DebugConfiguration[] = [];
            if (folder) {
                if (await isFunctionProject(folder.uri.fsPath)) {
                    result.push(this.debugConfig);
                }
            }

            return result;
        });

        // tslint:disable-next-line: strict-boolean-expressions
        return configs || [];
    }

    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration | undefined> {
        this._debugPorts.set(folder?.uri.toString(), <number | undefined>debugConfiguration.port);
        return super.resolveDebugConfiguration(folder, debugConfiguration, token);
    }

    protected getDebugPortOrPipeName(folder: WorkspaceFolder): number | string {
        // tslint:disable-next-line:strict-boolean-expressions
        return this._debugPorts.get(folder.uri.toString()) || this.defaultPortOrPipeName;
    }
}
