/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { IHookCallbackContext } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectLanguage, ProjectRuntime } from '../../src/ProjectSettings';
import { FunctionTesterBase } from './FunctionTesterBase';

class CSharpScriptFunctionTester extends FunctionTesterBase {
    protected _language: ProjectLanguage = ProjectLanguage.CSharpScript;
    protected _runtime: ProjectRuntime = ProjectRuntime.one;

    public async validateFunction(testFolder: string, funcName: string): Promise<void> {
        const functionPath: string = path.join(testFolder, funcName);
        assert.equal(await fse.pathExists(path.join(functionPath, 'run.csx')), true, 'run.csx does not exist');
        assert.equal(await fse.pathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
    }
}

suite('Create C# Script Function Tests', async () => {
    const tester: CSharpScriptFunctionTester = new CSharpScriptFunctionTester();

    suiteSetup(async () => {
        await tester.initAsync();
    });

    // tslint:disable-next-line:no-function-expression
    suiteTeardown(async function (this: IHookCallbackContext): Promise<void> {
        this.timeout(15 * 1000);
        await tester.dispose();
    });

    const httpTrigger: string = 'HTTP trigger';
    test(httpTrigger, async () => {
        await tester.testCreateFunction(
            httpTrigger,
            undefined // Use default Authorization level
        );
    });

    test('createFunction API', async () => {
        // Intentionally testing IoTHub trigger since a partner team plans to use that
        const templateId: string = 'IoTHubTrigger-CSharp';
        const functionName: string = 'createFunctionApi';
        await vscode.commands.executeCommand('azureFunctions.createFunction', tester.funcPortalTestFolder, templateId, functionName, { connection: 'test_EVENTHUB', path: 'sample-workitems', consumerGroup: '$Default' });
        await tester.validateFunction(tester.funcPortalTestFolder, functionName);
    });
});
