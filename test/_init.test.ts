/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISuiteCallbackContext } from 'mocha';
import { commands } from 'vscode';

suite('Initialize extension', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(120 * 1000); // two minutes should be enough time
    await commands.executeCommand('azureFunctions.refresh'); //activate the extension before testing begins to make sure activation doesn't change any extensionVariables
});
