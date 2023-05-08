/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration, WorkspaceFolder } from 'vscode';
import { hostStartTaskName, localhost } from '../constants';
import { localize } from '../localize';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';

export const defaultJavaDebugPort: number = 5005;

export const ballerinaDebugConfig: DebugConfiguration = {
    name: localize('attachJava', 'Attach to Ballerina Functions'),
    type: 'ballerina',
    request: 'attach',
    hostName: localhost,
    port: defaultJavaDebugPort,
    preLaunchTask: hostStartTaskName
};

export class BallerinaDebugProvider extends FuncDebugProviderBase {
    public readonly workerArgKey: string = 'languageWorkers__custom__arguments';
    protected readonly defaultPortOrPipeName: number = defaultJavaDebugPort;
    protected readonly debugConfig: DebugConfiguration = ballerinaDebugConfig;

    // eslint-disable-next-line @typescript-eslint/require-await
    public async getWorkerArgValue(folder: WorkspaceFolder): Promise<string> {
        const port: string | number = this.getDebugPortOrPipeName(folder);
        return `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${port}`;
    }
}
