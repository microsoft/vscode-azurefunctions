/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage, ProjectRuntime } from '../../src/ProjectSettings';
import { FunctionTesterBase } from './FunctionTesterBase';

class BashFunctionTester extends FunctionTesterBase {
    protected _language: ProjectLanguage = ProjectLanguage.Bash;
    protected _runtime: ProjectRuntime = ProjectRuntime.one;

    public async validateFunction(funcName: string): Promise<void> {
        const functionPath: string = path.join(this.testFolder, funcName);
        assert.equal(await fse.pathExists(path.join(functionPath, 'run.sh')), true, 'run.sh does not exist');
        assert.equal(await fse.pathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
    }
}

suite('Create Bash Function Tests', async () => {
    const tester: BashFunctionTester = new BashFunctionTester();

    suiteSetup(async () => {
        await tester.initAsync();
    });

    suiteTeardown(async () => {
        await tester.dispose();
    });

    const queueTrigger: string = 'Queue trigger';
    test(queueTrigger, async () => {
        await tester.testCreateFunction(
            queueTrigger,
            undefined, // New App Setting
            'connectionStringKey4',
            'connectionString',
            undefined // Use default queue name
        );
    });
});
