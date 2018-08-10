//
// PLEASE DO NOT MODIFY / DELETE UNLESS YOU KNOW WHAT YOU ARE DOING
//
// This file is providing the test runner to use when running extension tests.
// By default the test runner in use is Mocha based.
//
// You can provide your own test runner if you want to override it by exporting
// a function run(testRoot: string, clb: (error:Error) => void) that the extension
// host can call to run the tests. The test runner is expected to use console.log
// to report the results back to the caller. When the tests are finished, return
// a possible error to the callback or null if none.

import { commands } from 'vscode';
import { registerAppServiceExtensionVariables } from 'vscode-azureappservice';
import { registerUIExtensionVariables } from 'vscode-azureextensionui';
// tslint:disable-next-line:no-require-imports
import testRunner = require('vscode/lib/testrunner');
import { ext } from '../src/extensionVariables';
import { TestExtensionContext } from './TestExtensionContext';

// You can directly control Mocha options by uncommenting the following lines
// See https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically#set-options for more info
// tslint:disable-next-line:no-unsafe-any
testRunner.configure({
    ui: 'tdd', 		// the TDD UI is being used in extension.test.ts (suite, test, etc.)
    useColors: true // colored output from test results
});

module.exports = testRunner;

ext.context = new TestExtensionContext();
commands.executeCommand('azureFunctions.refresh'); //activate the extension before testing begins to make sure activation doesn't change any extensionVariables
registerAppServiceExtensionVariables(ext);
registerUIExtensionVariables(ext);
