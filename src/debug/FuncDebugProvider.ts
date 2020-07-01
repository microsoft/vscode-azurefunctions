/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DebugConfiguration, DebugConfigurationProvider, WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { func } from '../constants';
import { IPreDebugValidateResult, preDebugValidate } from './validatePreDebug';

export class FuncDebugProvider implements DebugConfigurationProvider {
    public async provideDebugConfigurations(_folder: WorkspaceFolder | undefined, _token?: CancellationToken): Promise<DebugConfiguration[]> {
        return [];
    }

    public async resolveDebugConfiguration(_folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, _token?: CancellationToken): Promise<DebugConfiguration | undefined> {
        let result: DebugConfiguration | undefined = debugConfiguration;

        await callWithTelemetryAndErrorHandling('resolveDebugConfiguration', async (context: IActionContext) => {
            context.telemetry.properties.isActivationEvent = 'true';
            context.errorHandling.suppressDisplay = true;
            context.telemetry.suppressIfSuccessful = true;

            if (debugConfiguration.program === func) {
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
}
