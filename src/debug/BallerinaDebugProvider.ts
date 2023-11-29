/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DebugConfiguration, type WorkspaceFolder } from 'vscode';
import { hostStartTaskName, localhost } from '../constants';
import { localize } from '../localize';
import { FuncDebugProviderBase } from './FuncDebugProviderBase';

export const defaultBallerinaDebugPort: number = 5005;

export const ballerinaDebugConfig: DebugConfiguration = {
    name: localize('attachBallerina', 'Attach to Ballerina Functions'),
    type: 'ballerina',
    request: 'attach',
    hostName: localhost,
    port: defaultBallerinaDebugPort,
    preLaunchTask: hostStartTaskName
};

export class BallerinaDebugProvider extends FuncDebugProviderBase {
    public readonly workerArgKey: string = 'BALLERINA_DEBUG_FLAGS';
    protected readonly defaultPortOrPipeName: number = defaultBallerinaDebugPort;
    protected readonly debugConfig: DebugConfiguration = ballerinaDebugConfig;

    public async getWorkerArgValue(folder: WorkspaceFolder): Promise<string> {
        const port: string | number = this.getDebugPortOrPipeName(folder);
        return `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${port}`;
    }

    protected getDebugConfigPort(debugConfiguration: DebugConfiguration): number | undefined {
        const debugPort: string | undefined = <string | undefined>debugConfiguration.debuggeePort;
        if (debugPort !== undefined) {
            return parseInt(debugPort);
        }
        return undefined;
    }
}
