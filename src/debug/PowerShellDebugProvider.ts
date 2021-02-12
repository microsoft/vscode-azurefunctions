/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration, WorkspaceFolder } from 'vscode';
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
    public readonly workerArgKey: string = 'PSWorkerCustomPipeName';
    protected defaultPortOrPipeName: string | number = defaultCustomPipeName;
    protected readonly debugConfig: DebugConfiguration = powershellDebugConfig;

    // eslint-disable-next-line @typescript-eslint/require-await
    public async getWorkerArgValue(folder: WorkspaceFolder): Promise<string> {
        const port: string | number = this.getDebugPortOrPipeName(folder);
        return String(port);
    }
}
