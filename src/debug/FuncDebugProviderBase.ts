/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, IActionContext } from '@microsoft/vscode-azext-utils';
import { CancellationToken, debug, DebugConfiguration, DebugConfigurationProvider, tasks, WorkspaceFolder } from 'vscode';
import { isFunctionProject } from '../commands/createNewProject/verifyIsProject';
import { hostStartTaskNameRegExp } from '../constants';
import { IPreDebugValidateResult, preDebugValidate } from './validatePreDebug';

export abstract class FuncDebugProviderBase implements DebugConfigurationProvider {
    public abstract workerArgKey: string;
    protected abstract defaultPortOrPipeName: number | string;
    protected abstract debugConfig: DebugConfiguration;

    private readonly _resolvedConfigurations = new Map<string, DebugConfiguration>();

    private readonly _debugPorts = new Map<WorkspaceFolder | undefined, number | undefined>();

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
            if (hostStartTaskNameRegExp.test(debugConfiguration.preLaunchTask)) {
                context.telemetry.properties.isActivationEvent = 'false';
                context.telemetry.suppressIfSuccessful = false;

                const preDebugResult: IPreDebugValidateResult = await preDebugValidate(context, debugConfiguration);
                if (!preDebugResult.shouldContinue) {
                    // Stop debugging only in this case
                    result = undefined;
                }
            }
        });

        const activeDebugSession = debug.activeDebugSession;
        console.log(activeDebugSession);

        const task = tasks.taskExecutions;
        console.log(task);

        // Always return the debugConfiguration passed in. If we return undefined we would block debugging and we don't want that.
        return result;
    }

    protected getDebugPortOrPipeName(folder: WorkspaceFolder): number | string {
        return this._debugPorts.get(folder) || this.defaultPortOrPipeName;
    }
}
