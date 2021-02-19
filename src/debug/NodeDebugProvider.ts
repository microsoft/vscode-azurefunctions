/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration, WorkspaceFolder } from 'vscode';
import { hostStartTaskName } from '../constants';
import { localize } from '../localize';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';

export const defaultNodeDebugPort: number = 9229;

export const nodeDebugConfig: DebugConfiguration = {
    name: localize('attachNode', 'Attach to Node Functions'),
    type: 'node',
    request: 'attach',
    port: defaultNodeDebugPort,
    preLaunchTask: hostStartTaskName,
    restart: true
};

export class NodeDebugProvider extends FuncDebugProviderBase {
    public readonly workerArgKey: string = 'languageWorkers__node__arguments';
    protected readonly defaultPortOrPipeName: number = defaultNodeDebugPort;
    protected readonly debugConfig: DebugConfiguration = nodeDebugConfig;

    // eslint-disable-next-line @typescript-eslint/require-await
    public async getWorkerArgValue(folder: WorkspaceFolder): Promise<string> {
        const port: string | number = this.getDebugPortOrPipeName(folder);
        return `--inspect=${port}`;
    }
}
