/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DebugConfiguration, DebugConfigurationProvider, WorkspaceFolder } from 'vscode';
import { localize } from '../localize';

export class FuncCoreClrDebugConfigProvider implements DebugConfigurationProvider {
    public async provideDebugConfigurations(_folder: WorkspaceFolder | undefined, _token?: CancellationToken): Promise<DebugConfiguration[]> {
        return [getCoreClrLaunchConfiguration()];
    }

    public async resolveDebugConfiguration(_folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, _token?: CancellationToken): Promise<DebugConfiguration> {
        // todo check extension dependency
        debugConfiguration.type = 'coreclr';
        debugConfiguration.program = 'func';
        debugConfiguration.args = ['host', 'start'];
        debugConfiguration.console = 'internalConsole';
        return debugConfiguration;
    }
}

export function getCoreClrLaunchConfiguration(targetFramework?: string): DebugConfiguration {
    return {
        name: localize('launchFuncs', 'Func: Launch C# Functions'),
        type: 'func-coreclr',
        request: 'launch',
        // tslint:disable-next-line:no-invalid-template-strings
        cwd: `\${workspaceFolder}/bin/Debug/${targetFramework || '<insert-target-framework-here>'}`,
        preLaunchTask: 'build',
        internalConsoleOptions: 'openOnSessionStart'
    };
}
