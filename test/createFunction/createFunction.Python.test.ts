/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage, ProjectRuntime } from '../../src/ProjectSettings';
import { FunctionTesterBase } from './FunctionTesterBase';

class PythonFunctionTester extends FunctionTesterBase {
    protected _language: ProjectLanguage = ProjectLanguage.Python;
    protected _runtime: ProjectRuntime = ProjectRuntime.one;

    public async validateFunction(funcName: string): Promise<void> {
        const functionPath: string = path.join(this.testFolder, funcName);
        assert.equal(await fse.pathExists(path.join(functionPath, 'run.py')), true, 'run.py does not exist');
        assert.equal(await fse.pathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
    }
}

suite('Create Python Function Tests', async () => {
    const tester: PythonFunctionTester = new PythonFunctionTester();

    suiteSetup(async () => {
        await tester.initAsync();
    });

    suiteTeardown(async () => {
        await tester.dispose();
    });

    const httpTrigger: string = 'HTTP trigger';
    test(httpTrigger, async () => {
        await tester.testCreateFunction(
            httpTrigger,
            undefined // Use default Authorization level
        );
    });
});
