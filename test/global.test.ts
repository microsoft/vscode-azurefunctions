/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHookCallbackContext } from 'mocha';
import * as vscode from 'vscode';
import { FunctionTemplates, getFunctionTemplates } from '../src/templates/FunctionTemplates';

export let backupTemplates: FunctionTemplates;
export let latestTemplates: FunctionTemplates;
export let stagingTemplates: FunctionTemplates;
export let longRunningTestsEnabled: boolean;

// Runs before all tests
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(120 * 1000);
    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin

    backupTemplates = await getFunctionTemplates('backup');
    latestTemplates = await getFunctionTemplates('cliFeed');
    stagingTemplates = await getFunctionTemplates('stagingCliFeed');
    if (process.env.ENABLE_LONG_RUNNING_TESTS === undefined) {
        longRunningTestsEnabled = process.env.TRAVIS_EVENT_TYPE === 'cron';
    } else {
        longRunningTestsEnabled = !/^(false|0)?$/i.test(process.env.ENABLE_LONG_RUNNING_TESTS);
    }
});
