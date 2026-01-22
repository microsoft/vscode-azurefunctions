/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp, nonNullValue } from "@microsoft/vscode-azext-utils";

export class ScenariosTracker {
    private scenarioStatuses: Map<string, ScenarioStatus> = new Map();

    private getScenarioStatus(scenarioLabel: string): ScenarioStatus {
        return nonNullValue(this.scenarioStatuses.get(scenarioLabel));
    }

    private getCreateAndDeployTest(scenarioLabel: string, id: number): CreateAndDeployTest {
        const scenario = this.getScenarioStatus(scenarioLabel);
        scenario.createAndDeployTests ??= [];
        return nonNullValue(scenario.createAndDeployTests[id]);
    }

    private updateTestStatus(testResult: TestResult, status: TestStatus, error?: string): void {
        testResult.status = status;
        if (error) {
            testResult.error = error;
        }
    }

    initScenario(scenarioLabel: string): void {
        if (this.scenarioStatuses.has(scenarioLabel)) {
            return;
        }
        this.scenarioStatuses.set(scenarioLabel, { label: scenarioLabel });
    }

    startCreateNewProject(scenarioLabel: string, createNewProjectLabel: string): void {
        const scenarioStatus = this.getScenarioStatus(scenarioLabel);
        scenarioStatus.createNewProject = { label: createNewProjectLabel };
    }

    passCreateNewProject(scenarioLabel: string): void {
        const scenarioStatus = this.getScenarioStatus(scenarioLabel);
        const createNewProjectStatus = nonNullProp(scenarioStatus, 'createNewProject');
        this.updateTestStatus(createNewProjectStatus, 'pass');
    }

    failCreateNewProject(scenarioLabel: string, error: string): void {
        const scenarioStatus = this.getScenarioStatus(scenarioLabel);
        const createNewProjectStatus = nonNullProp(scenarioStatus, 'createNewProject');
        this.updateTestStatus(createNewProjectStatus, 'fail', error);
    }

    initCreateAndDeployTest(scenarioLabel: string): number {
        const scenarioStatus = this.getScenarioStatus(scenarioLabel);
        scenarioStatus.createAndDeployTests ??= [];

        const id: number = scenarioStatus.createAndDeployTests.length;
        scenarioStatus.createAndDeployTests.push({});
        return id;
    }

    startCreateFunctionApp(scenarioLabel: string, createAndDeployTestId: number, createLabel: string): void {
        const createAndDeployTest = this.getCreateAndDeployTest(scenarioLabel, createAndDeployTestId);
        createAndDeployTest.createFunctionApp = { label: createLabel };
    }

    passCreateFunctionApp(scenarioLabel: string, createAndDeployTestId: number): void {
        const createAndDeployTest = this.getCreateAndDeployTest(scenarioLabel, createAndDeployTestId);
        const createFunctionAppTest = nonNullValue(createAndDeployTest.createFunctionApp);
        this.updateTestStatus(createFunctionAppTest, 'pass');
    }

    failCreateFunctionApp(scenarioLabel: string, createAndDeployTestId: number, error: string): void {
        const createAndDeployTest = this.getCreateAndDeployTest(scenarioLabel, createAndDeployTestId);
        const createFunctionAppTest = nonNullValue(createAndDeployTest.createFunctionApp);
        this.updateTestStatus(createFunctionAppTest, 'fail', error);
    }

    startDeployFunctionApp(scenarioLabel: string, createAndDeployTestId: number, deployLabel: string): void {
        const createAndDeployTest = this.getCreateAndDeployTest(scenarioLabel, createAndDeployTestId);
        createAndDeployTest.deployFunctionApp = { label: deployLabel };
    }

    passDeployFunctionApp(scenarioLabel: string, createAndDeployTestId: number): void {
        const createAndDeployTest = this.getCreateAndDeployTest(scenarioLabel, createAndDeployTestId);
        const deployFunctionAppTest = nonNullValue(createAndDeployTest.deployFunctionApp);
        this.updateTestStatus(deployFunctionAppTest, 'pass');
    }

    warnDeployFunctionApp(scenarioLabel: string, createAndDeployTestId: number, error?: string): void {
        const createAndDeployTest = this.getCreateAndDeployTest(scenarioLabel, createAndDeployTestId);
        const deployFunctionAppTest = nonNullValue(createAndDeployTest.deployFunctionApp);
        this.updateTestStatus(deployFunctionAppTest, 'warn', error);
    }

    failDeployFunctionApp(scenarioLabel: string, createAndDeployTestId: number, error: string): void {
        const createAndDeployTest = this.getCreateAndDeployTest(scenarioLabel, createAndDeployTestId);
        const deployFunctionAppTest = nonNullValue(createAndDeployTest.deployFunctionApp);
        this.updateTestStatus(deployFunctionAppTest, 'fail', error);
    }

    report(): void {
        if (!this.scenarioStatuses.size) {
            console.log('No test scenarios recorded.');
            return;
        }

        const lines: string[] = [];
        const icons: Record<TestStatus | 'undefined', string> = {
            pass: '✅',
            warn: '⚠️',
            fail: '❌',
            undefined: '-',
        };
        const maxErrorLength = 200;

        const getStatusIcon = (status: TestStatus | undefined): string => {
            return icons[String(status)];
        };

        const truncateError = (error: string | undefined): string => {
            if (!error) {
                return '';
            }
            if (error.length <= maxErrorLength) {
                return error;
            }
            return error.substring(0, maxErrorLength) + '...';
        };

        lines.push('| # | Scenario | Test | Status | Error |');
        lines.push('|---|----------|------|--------|-------|');

        let rowNum = 1;
        for (const [, scenario] of this.scenarioStatuses) {
            const scenarioLabel = scenario.label;

            // Report createNewProject test
            if (scenario.createNewProject) {
                const statusIcon = getStatusIcon(scenario.createNewProject.status);
                const error = truncateError(scenario.createNewProject.error);
                const errorCell = error ? ` | ${error} |` : '';
                lines.push(`| ${rowNum++} | ${scenarioLabel} | ${scenario.createNewProject.label} | ${statusIcon}${errorCell}`);
            }

            // Report createAndDeployTests
            if (scenario.createAndDeployTests) {
                for (const test of scenario.createAndDeployTests) {
                    if (test.createFunctionApp) {
                        const statusIcon = getStatusIcon(test.createFunctionApp.status);
                        const error = truncateError(test.createFunctionApp.error);
                        const errorCell = error ? ` | ${error} |` : '';
                        lines.push(`| ${rowNum++} | ${scenarioLabel} | ${test.createFunctionApp.label} | ${statusIcon}${errorCell}`);
                    }
                    if (test.deployFunctionApp) {
                        const statusIcon = getStatusIcon(test.deployFunctionApp.status);
                        const error = truncateError(test.deployFunctionApp.error);
                        const errorCell = error ? ` | ${error} |` : '';
                        lines.push(`| ${rowNum++} | ${scenarioLabel} | ${test.deployFunctionApp.label} | ${statusIcon}${errorCell}`);
                    }
                }
            }
        }

        const reportCard: string = lines.join('\n');
        console.log(reportCard);
    }
}

type TestStatus = 'pass' | 'warn' | 'fail';

type TestResult = {
    label: string;
    status?: TestStatus;
    error?: string;
};

type ScenarioStatus = {
    label: string;
    createNewProject?: TestResult;
    createAndDeployTests?: CreateAndDeployTest[];
}

type CreateAndDeployTest = {
    createFunctionApp?: TestResult;
    deployFunctionApp?: TestResult;
};
