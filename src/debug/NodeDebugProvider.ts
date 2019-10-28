/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration, ShellExecutionOptions, WorkspaceFolder } from 'vscode';
import { hostStartTaskName } from '../constants';
import { localize } from '../localize';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';

export const defaultNodeDebugPort: number = 9229;

export const nodeDebugConfig: DebugConfiguration = {
    name: localize('attachNode', 'Attach to Node Functions'),
    type: 'node',
    request: 'attach',
    port: defaultNodeDebugPort,
    preLaunchTask: hostStartTaskName
};

export class NodeDebugProvider extends FuncDebugProviderBase {
    protected readonly defaultPortOrPipeName: number = defaultNodeDebugPort;
    protected readonly debugConfig: DebugConfiguration = nodeDebugConfig;

    public async getExecutionOptions(folder: WorkspaceFolder): Promise<ShellExecutionOptions> {
        const port: string | number = this.getDebugPortOrPipeName(folder);
        return { env: { languageWorkers__node__arguments: `--inspect=${port}` } };
    }
}
