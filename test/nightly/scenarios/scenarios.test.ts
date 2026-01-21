/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { longRunningTestsEnabled } from '../../global.test';
import { generateParallelScenarios, TestLevel, type AzExtFunctionsParallelTestScenario } from './parallelScenarios';

const testScenarios: AzExtFunctionsParallelTestScenario[] = generateParallelScenarios();

suite.only('Scenarios', async function (this: Mocha.Suite) {
    this.timeout(45 * 60 * 1000);

    suiteSetup(async function (this: Mocha.Context) {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        // For quickly specifying tests to isolate:
        // - Set `AzCode_ScenarioToIsolateAndExpand` env var to match the scenario title to isolate and run with the expanded test suite. TODO: Enable setting this for manual runs in the remote pipelines.
        // - Set `only: true` on a scenario definition to more quickly isolate during local development/debugging purposes.  Defaults to a test level of "core".
        //
        // When not running isolated tests, test level will always default to "core" to minimize the number of service requests.
        const onlyTestScenario = testScenarios.find(s => {
            if (process.env.AzCode_ScenarioToIsolateAndExpand) {
                return s.title === process.env.AzCode_ScenarioToIsolateAndExpand;
            }
            return s.only;
        });
        const testLevel: TestLevel = process.env.AzCode_ScenarioToIsolateAndExpand ? TestLevel.Expanded : TestLevel.Core;

        if (onlyTestScenario) {
            onlyTestScenario.scenario = onlyTestScenario.runScenario(testLevel);
        } else {
            for (const s of testScenarios) {
                s.scenario = s.runScenario(TestLevel.Core);
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
