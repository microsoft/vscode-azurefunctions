/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHookCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../src/extensionVariables';
import { FunctionTemplates, getFunctionTemplates } from '../src/templates/FunctionTemplates';

export let backupTemplates: FunctionTemplates;
export let latestTemplates: FunctionTemplates;
export let stagingTemplates: FunctionTemplates;
export let longRunningTestsEnabled: boolean;

// Runs before all tests
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(120 * 1000);
    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin

    // Use prerelease func cli installed from gulp task (unless otherwise specified in env)
    ext.funcCliPath = process.env.FUNC_PATH || path.join(os.homedir(), 'tools', 'func', 'func');

    backupTemplates = await getFunctionTemplates('backup');
    latestTemplates = await getFunctionTemplates('cliFeed');
    stagingTemplates = await getFunctionTemplates('stagingCliFeed');
    // tslint:disable-next-line:strict-boolean-expressions
    longRunningTestsEnabled = !/^(false|0)?$/i.test(process.env.ENABLE_LONG_RUNNING_TESTS || '');
});
