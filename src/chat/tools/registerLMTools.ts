/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerLMTool } from '@microsoft/vscode-azext-utils';
import { GetFuncHostErrors } from './GetFuncHostErrors/GetFuncHostErrors';
import { GetFuncHostLogs } from './GetFuncHostLogs/GetFuncHostLogs';
import { StartDebugging } from './StartDebugging/StartDebugging';
import { StopDebugging } from './StopDebugging/StopDebugging';

export function registerLMTools(): void {
    // Read-only / contextual tools — no side effects, no confirmation needed
    registerLMTool('azurefunctions_getFuncHostLogs', new GetFuncHostLogs());
    registerLMTool('azurefunctions_getFuncHostErrors', new GetFuncHostErrors());

    // Functional tools — have side effects, should implement prepareInvocation for confirmation
    registerLMTool('azurefunctions_startDebugging', new StartDebugging());
    registerLMTool('azurefunctions_stopDebugging', new StopDebugging());
}
