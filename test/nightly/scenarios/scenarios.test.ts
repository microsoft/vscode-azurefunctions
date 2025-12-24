/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp, updateGlobalSetting } from '../../../extension.bundle';
import { longRunningTestsEnabled } from '../../global.test';
import { generateParallelScenarios, type AzExtFunctionsParallelTestScenario } from './parallelScenarios';

const testScenarios: AzExtFunctionsParallelTestScenario[] = generateParallelScenarios();

suite.only('Scenarios', async function (this: Mocha.Suite) {
    this.timeout(15 * 60 * 1000);

    suiteSetup(async function (this: Mocha.Context) {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
        // Todo: This should probably happen elsewhere?
        await updateGlobalSetting('groupBy', 'resourceType', 'azureResourceGroups');

        for (const s of testScenarios) {
            s.scenario = s.runScenario();
        }
    });

    for (const s of testScenarios) {
        test(s.title, async function () {
            await nonNullProp(s, 'scenario');
        });
    }
});
