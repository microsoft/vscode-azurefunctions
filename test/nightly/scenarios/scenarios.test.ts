/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { longRunningTestsEnabled } from '../../global.test';
import { generateParallelScenarios, TestPlan, type AzExtFunctionsParallelTestScenario } from './parallelScenarios';

const testScenarios: AzExtFunctionsParallelTestScenario[] = generateParallelScenarios();

suite.only('Scenarios', async function (this: Mocha.Suite) {
    // Unfortunately, durable task schedulers sometimes take ~30m to provision
    this.timeout(45 * 60 * 1000);

    suiteSetup(async function (this: Mocha.Context) {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        const onlyTestScenario = testScenarios.find(s => {
            if (process.env.AzCode_OnlyLongRunningTestScenario) {
                return s.title === process.env.AzCode_OnlyLongRunningTestScenario;
            }
            return s.only;
        });
        const testPlan: TestPlan = process.env.AzCode_OnlyLongRunningTestScenario ? TestPlan.Extended : TestPlan.Core;

        if (onlyTestScenario) {
            onlyTestScenario.scenario = onlyTestScenario.runScenario(testPlan);
        } else {
            for (const s of testScenarios) {
                s.scenario = s.runScenario(TestPlan.Core);
            }
        }
    });

    for (const s of testScenarios) {
        test(s.title, async function (this: Mocha.Context) {
            if (!s.scenario) {
                this.skip();
            }
            await s.scenario;
        });
    }
});
