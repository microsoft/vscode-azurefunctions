/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp, nonNullValue } from "@microsoft/vscode-azext-utils";


export class ScenariosTracker {
    private scenarioStatuses: Map<string, ScenarioStatus> = new Map();

    initScenario(scenarioLabel: string): void {
        if (this.scenarioStatuses.has(scenarioLabel)) {
            return;
        }
        this.scenarioStatuses.set(scenarioLabel, { label: scenarioLabel });
    }

    startCreateNewProject(scenarioLabel: string, createNewProjectLabel: string): void {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        scenarioStatus.createNewProject = {
            label: createNewProjectLabel,
            passed: false,
        };
        this.scenarioStatuses.set(scenarioLabel, scenarioStatus);
    }

    passCreateNewProject(scenarioLabel: string): void {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        const createNewProjectStatus = nonNullProp(scenarioStatus, 'createNewProject');
        createNewProjectStatus.passed = true;
        this.scenarioStatuses.set(scenarioLabel, scenarioStatus);
    }

    failCreateNewProject(scenarioLabel: string, error: string): void {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        const createNewProjectStatus = nonNullProp(scenarioStatus, 'createNewProject');
        createNewProjectStatus.passed = false;
        createNewProjectStatus.error = error;
        this.scenarioStatuses.set(scenarioLabel, scenarioStatus);
    }

    initCreateAndDeployTest(scenarioLabel: string): number {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        scenarioStatus.createAndDeployTests ??= [];

        const id: number = scenarioStatus.createAndDeployTests.length;
        scenarioStatus.createAndDeployTests.push({});
        return id;
    }

    startCreateFunctionApp(scenarioLabel: string, createAndDeployTestId: number, createLabel: string): void {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        scenarioStatus.createAndDeployTests ??= [];

        const createAndDeployTest = nonNullValue(scenarioStatus.createAndDeployTests[createAndDeployTestId]);
        createAndDeployTest.createFunctionApp = {
            label: createLabel,
            passed: false,
        };

        this.scenarioStatuses.set(scenarioLabel, scenarioStatus);
    }

    passCreateFunctionApp(scenarioLabel: string, createAndDeployTestId: number): void {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        scenarioStatus.createAndDeployTests ??= [];

        const createAndDeployTest = nonNullValue(scenarioStatus.createAndDeployTests[createAndDeployTestId]);
        const createFunctionAppTest = nonNullValue(createAndDeployTest.createFunctionApp);
        createFunctionAppTest.passed = true;

        this.scenarioStatuses.set(scenarioLabel, scenarioStatus);
    }

    failCreateFunctionApp(scenarioLabel: string, createAndDeployTestId: number, error: string): void {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        scenarioStatus.createAndDeployTests ??= [];

        const createAndDeployTest = nonNullValue(scenarioStatus.createAndDeployTests[createAndDeployTestId]);
        const createFunctionAppTest = nonNullValue(createAndDeployTest.createFunctionApp);
        createFunctionAppTest.passed = false;
        createFunctionAppTest.error = error;

        this.scenarioStatuses.set(scenarioLabel, scenarioStatus);
    }

    startDeployFunctionApp(scenarioLabel: string, createAndDeployTestId: number, deployLabel: string): void {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        scenarioStatus.createAndDeployTests ??= [];

        const createAndDeployTest = nonNullValue(scenarioStatus.createAndDeployTests[createAndDeployTestId]);
        createAndDeployTest.deployFunctionApp = {
            label: deployLabel,
            passed: false,
        };

        this.scenarioStatuses.set(scenarioLabel, scenarioStatus);
    }

    passDeployFunctionApp(scenarioLabel: string, createAndDeployTestId: number): void {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        scenarioStatus.createAndDeployTests ??= [];

        const createAndDeployTest = nonNullValue(scenarioStatus.createAndDeployTests[createAndDeployTestId]);
        const deployFunctionAppTest = nonNullValue(createAndDeployTest.deployFunctionApp);
        deployFunctionAppTest.passed = true;

        this.scenarioStatuses.set(scenarioLabel, scenarioStatus);
    }

    failDeployFunctionApp(scenarioLabel: string, createAndDeployTestId: number, error: string): void {
        const scenarioStatus = nonNullValue(this.scenarioStatuses.get(scenarioLabel));
        scenarioStatus.createAndDeployTests ??= [];

        const createAndDeployTest = nonNullValue(scenarioStatus.createAndDeployTests[createAndDeployTestId]);
        const deployFunctionAppTest = nonNullValue(createAndDeployTest.deployFunctionApp);
        deployFunctionAppTest.passed = false;
        deployFunctionAppTest.error = error;

        this.scenarioStatuses.set(scenarioLabel, scenarioStatus);
    }

    report(): string {
        if (!this.scenarioStatuses.size) {
            return 'No test scenarios recorded.';
        }

        const lines: string[] = [];
        const passIcon = '✅';
        const failIcon = '❌';
        const dashIcon = '-';
        const maxErrorLength = 200;

        const getStatusIcon = (passed: boolean | undefined): string => {
            if (passed === undefined) {
                return dashIcon;
            }
            return passed ? passIcon : failIcon;
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
                const status = getStatusIcon(scenario.createNewProject.passed);
                const error = truncateError(scenario.createNewProject.error);
                const errorCell = error ? ` | ${error} |` : '';
                lines.push(`| ${rowNum++} | ${scenarioLabel} | ${scenario.createNewProject.label} | ${status}${errorCell}`);
            }

            // Report createAndDeployTests
            if (scenario.createAndDeployTests) {
                for (const test of scenario.createAndDeployTests) {
                    if (test.createFunctionApp) {
                        const status = getStatusIcon(test.createFunctionApp.passed);
                        const error = truncateError(test.createFunctionApp.error);
                        const errorCell = error ? ` | ${error} |` : '';
                        lines.push(`| ${rowNum++} | ${scenarioLabel} | ${test.createFunctionApp.label} | ${status}${errorCell}`);
                    }
                    if (test.deployFunctionApp) {
                        const status = getStatusIcon(test.deployFunctionApp.passed);
                        const error = truncateError(test.deployFunctionApp.error);
                        const errorCell = error ? ` | ${error} |` : '';
                        lines.push(`| ${rowNum++} | ${scenarioLabel} | ${test.deployFunctionApp.label} | ${status}${errorCell}`);
                    }
                }
            }
        }

        return lines.join('\n');
    }
}

type ScenarioStatus = {
    label: string;
    createNewProject?: {
        label: string;
        passed?: boolean;
        error?: string;
    };
    createAndDeployTests?: {
        createFunctionApp?: {
            label: string;
            passed?: boolean;
            error?: string;
        };
        deployFunctionApp?: {
            label: string;
            passed?: boolean;
            error?: string;
        };
    }[];
}
