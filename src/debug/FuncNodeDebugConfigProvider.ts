/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DebugConfiguration, DebugConfigurationProvider, WorkspaceFolder } from 'vscode';
import { localize } from '../localize';

export class FuncNodeDebugConfigProvider implements DebugConfigurationProvider {
    public async provideDebugConfigurations(_folder: WorkspaceFolder | undefined, _token?: CancellationToken): Promise<DebugConfiguration[]> {
        return [getNodeLaunchConfiguration()];
    }

    public async resolveDebugConfiguration(_folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, _token?: CancellationToken): Promise<DebugConfiguration> {
        // todo check extension dependency
        debugConfiguration.port = debugConfiguration.port || 5858;
        debugConfiguration.type = 'node';
        debugConfiguration.runtimeExecutable = 'func';
        debugConfiguration.runtimeArgs = ['host', 'start'];
        debugConfiguration.console = 'internalConsole';
        debugConfiguration.env = {
            'languageWorkers:node:arguments': `--inspect=${debugConfiguration.port}`
        };
        debugConfiguration.outputCapture = 'std';
        return debugConfiguration;
    }
}

export function getNodeLaunchConfiguration(): DebugConfiguration {
    return {
        name: localize('launchFuncs', 'Func: Launch JavaScript Functions'),
        type: 'func-node',
        request: 'launch',
        port: 5858,
        internalConsoleOptions: 'openOnSessionStart'
    };
}
