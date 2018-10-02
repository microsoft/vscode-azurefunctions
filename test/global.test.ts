/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHookCallbackContext } from 'mocha';
import * as vscode from 'vscode';
import { FunctionTemplates, getFunctionTemplates } from '../src/templates/FunctionTemplates';

export let backupTemplates: FunctionTemplates;
export let latestTemplates: FunctionTemplates;

// Runs before all tests
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(120 * 1000);
    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin

    backupTemplates = await getFunctionTemplates('backup');
    latestTemplates = await getFunctionTemplates('cliFeed');
    // stagingTemplates https://github.com/Microsoft/vscode-azurefunctions/issues/334
});
