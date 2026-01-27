/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { longRunningTestsEnabled } from '../../global.test';
import { generateParallelScenarios, TestLevel, type AzExtFunctionsParallelTestScenario } from './parallelScenarios';

const testScenarios: AzExtFunctionsParallelTestScenario[] = generateParallelScenarios();

suite.only('Scenarios', async function (this: Mocha.Suite) {
    this.timeout(40 * 60 * 1000);

    suiteSetup(async function (this: Mocha.Context) {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        // For quickly specifying tests to isolate:
        // - Set the `AzCode_RunScenarioExtended` env var to match the scenario label you want to isolate. This will automatically run with the extended test suite. TODO: Enable setting this for manual runs in the remote pipelines.
        // - Setting `only: true` on a scenario definition also allows more quickly isolating a run during local development.  Note this naturally defaults to a test level of "basic".
        //
        // When not running isolated tests, test level will always default to "basic" to minimize the number of service requests to avoid running into 429 ratelimit errors.
        const onlyTestScenario = testScenarios.find(s => {
            if (process.env.AzCode_RunScenarioExtended) {
                return s.title === process.env.AzCode_RunScenarioExtended;
            }
            return s.only;
        });
        const testLevel: TestLevel = process.env.AzCode_RunScenarioExtended ? TestLevel.Extended : TestLevel.Basic;

        if (onlyTestScenario) {
            onlyTestScenario.scenario = onlyTestScenario.runScenario(testLevel);
        } else {
            for (const s of testScenarios) {
                s.scenario = s.runScenario(TestLevel.Basic);
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
