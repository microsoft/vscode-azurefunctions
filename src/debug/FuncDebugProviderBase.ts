/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type CancellationToken, type DebugConfiguration, type DebugConfigurationProvider, type WorkspaceFolder } from 'vscode';
import { isFunctionProject } from '../commands/createNewProject/verifyIsProject';
import { hostStartTaskNameRegExp } from '../constants';
import { preDebugValidate, type IPreDebugValidateResult } from './validatePreDebug/validatePreDebug';

export abstract class FuncDebugProviderBase implements DebugConfigurationProvider {
    public abstract workerArgKey: string;
    protected abstract defaultPortOrPipeName: number | string;
    protected abstract debugConfig: DebugConfiguration;

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

            this._debugPorts.set(folder, this.getDebugConfigPort(debugConfiguration));
            if (hostStartTaskNameRegExp.test(debugConfiguration.preLaunchTask as string)) {
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

    protected getDebugConfigPort(debugConfiguration: DebugConfiguration): number | undefined {
        return <number | undefined>debugConfiguration.port;
    }

    protected getDebugPortOrPipeName(folder: WorkspaceFolder): number | string {
        return this._debugPorts.get(folder) || this.defaultPortOrPipeName;
    }
}
