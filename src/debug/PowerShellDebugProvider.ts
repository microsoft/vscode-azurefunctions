/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration, ShellExecutionOptions, WorkspaceFolder } from 'vscode';
import { hostStartTaskName } from '../constants';
import { localize } from '../localize';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';

export const defaultCustomPipeName: string = 'AzureFunctionsPSWorker';

export const powershellDebugConfig: DebugConfiguration = {
    name: localize('attachPowerShell', 'Attach to PowerShell Functions'),
    type: 'PowerShell',
    request: 'attach',
    customPipeName: defaultCustomPipeName,
    runspaceId: 1,
    preLaunchTask: hostStartTaskName
};

export class PowerShellDebugProvider extends FuncDebugProviderBase {
    protected defaultPortOrPipeName: string | number = defaultCustomPipeName;
    protected readonly debugConfig: DebugConfiguration = powershellDebugConfig;

    public async getExecutionOptions(folder: WorkspaceFolder): Promise<ShellExecutionOptions> {
        const port: string | number = this.getDebugPortOrPipeName(folder);
        return { env: { PSWorkerCustomPipeName: `${port}` } };
    }
}
