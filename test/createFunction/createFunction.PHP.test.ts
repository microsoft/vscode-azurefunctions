/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage, ProjectRuntime } from '../../src/ProjectSettings';
import { FunctionTesterBase } from './FunctionTesterBase';

class PHPFunctionTester extends FunctionTesterBase {
    protected _language: ProjectLanguage = ProjectLanguage.PHP;
    protected _runtime: ProjectRuntime = ProjectRuntime.one;

    public async validateFunction(funcName: string): Promise<void> {
        const functionPath: string = path.join(this.testFolder, funcName);
        assert.equal(await fse.pathExists(path.join(functionPath, 'run.php')), true, 'run.php does not exist');
        assert.equal(await fse.pathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
    }
}

suite('Create PHP Function Tests', async () => {
    const tester: PHPFunctionTester = new PHPFunctionTester();

    suiteSetup(async () => {
        await tester.initAsync();
    });

    suiteTeardown(async () => {
        await tester.dispose();
    });

    const httpTrigger: string = 'HTTP GET';
    test(httpTrigger, async () => {
        await tester.testCreateFunction(
            httpTrigger,
            undefined // Use default Authorization level
        );
    });
});
