/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DebugConfiguration, DebugConfigurationProvider, WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { isFunctionProject } from '../commands/createNewProject/verifyIsProject';
import { hostStartTaskName } from '../constants';
import { IPreDebugValidateResult, preDebugValidate } from './validatePreDebug';

export abstract class FuncDebugProviderBase implements DebugConfigurationProvider {
    public abstract workerArgKey: string;
    protected abstract defaultPortOrPipeName: number | string;
    protected abstract debugConfig: DebugConfiguration;

    private readonly _debugPorts: Map<WorkspaceFolder | undefined, number | undefined> = new Map<WorkspaceFolder | undefined, number | undefined>();

    public abstract getWorkerArgValue(folder: WorkspaceFolder): Promise<string>;

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

        return configs || [];
    }

    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, _token?: CancellationToken): Promise<DebugConfiguration | undefined> {
        let result: DebugConfiguration | undefined = debugConfiguration;

        await callWithTelemetryAndErrorHandling('resolveDebugConfiguration', async (context: IActionContext) => {
            context.telemetry.properties.isActivationEvent = 'true';
            context.errorHandling.suppressDisplay = true;
            context.telemetry.suppressIfSuccessful = true;

            this._debugPorts.set(folder, <number | undefined>debugConfiguration.port);
            if (debugConfiguration.preLaunchTask === hostStartTaskName) {
                context.telemetry.properties.isActivationEvent = 'false';
                context.telemetry.suppressIfSuccessful = false;

                const preDebugResult: IPreDebugValidateResult = await preDebugValidate(context, debugConfiguration);
                if (!preDebugResult.shouldContinue) {
                    // Stop debugging only in this case
                    result = undefined;
                }
            }
        });

        // Always return the debugConfiguration passed in. If we return undefined we would block debugging and we don't want that.
        return result;
    }

    protected getDebugPortOrPipeName(folder: WorkspaceFolder): number | string {
        return this._debugPorts.get(folder) || this.defaultPortOrPipeName;
    }
}
