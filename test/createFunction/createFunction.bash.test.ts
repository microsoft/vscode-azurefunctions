/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage, ProjectRuntime, ScriptProjectCreatorBase } from '../../extension.bundle';
import { FunctionTesterBase } from './FunctionTesterBase';

class BashFunctionTester extends FunctionTesterBase {
    protected _language: ProjectLanguage = ProjectLanguage.Bash;
    protected _runtime: ProjectRuntime = ScriptProjectCreatorBase.defaultRuntime;

    public async validateFunction(testFolder: string, funcName: string): Promise<void> {
        const functionPath: string = path.join(testFolder, funcName);
        assert.equal(await fse.pathExists(path.join(functionPath, 'run.sh')), true, 'run.sh does not exist');
        assert.equal(await fse.pathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
    }
}

suite('Create Bash Function Tests', async () => {
    const tester: BashFunctionTester = new BashFunctionTester();

    suiteSetup(async () => {
        await tester.initAsync();
    });

    const queueTrigger: string = 'Queue trigger';
    test(queueTrigger, async () => {
        await tester.testCreateFunction(
            queueTrigger,
            'AzureWebJobsStorage', // Use existing app setting
            undefined // Use default queue name
        );
    });
});
