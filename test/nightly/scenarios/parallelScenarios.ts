/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import { AzExtFsExtra, parseError } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { workspace, type Uri, type WorkspaceFolder } from 'vscode';
import { createFunctionApp, createFunctionAppAdvanced, createNewProjectInternal, deployProductionSlotByFunctionAppId } from '../../../extension.bundle';
import { CreateMode } from '../../utils/createFunctionAppUtils';
import { resourceGroupsToDelete, scenariosTracker } from '../global.nightly.test';
import { type AzExtFunctionsTestScenario, type CreateAndDeployTestCase } from './testScenarios/AzExtFunctionsTestScenario';
import { generateTestScenarios } from './testScenarios/testScenarios';

/**
 * A wrapper for {@link AzExtFunctionsTestScenario}. Prepares a scenario for concurrent test execution.
 */
export interface AzExtFunctionsParallelTestScenario {
    /**
     * A descriptive title for the test scenario that will logged in the final test report.
     */
    title: string;

    /**
     * Holds a reference to the promise representing the running scenario. This is used so that all scenarios can be concurrently awaited.
     */
    scenario?: Promise<void>;

    /**
     * Starts the concurrent test scenario based on the specified test level.
     * @param testLevel - Specifies which level of tests to run: 'basic' vs. 'extended'
     */
    runScenario(testLevel: TestLevel): Promise<void>;

    /**
     * Indicates this scenario should be executed exclusively. This should only be used to aid with local development.
     */
    only?: boolean;
}

export function generateParallelScenarios(): AzExtFunctionsParallelTestScenario[] {
    return generateTestScenarios().map(scenario => {
        return {
            title: scenario.label,
            runScenario: generateRunScenario(scenario),
            only: scenario.only,
        };
    });
}

function generateRunScenario(scenario: AzExtFunctionsTestScenario): AzExtFunctionsParallelTestScenario['runScenario'] {
    return async function runScenario(testLevel: TestLevel) {
        const workspaceFolderUri: Uri = getWorkspaceFolderUri(scenario.folderName);
        const rootFolder = workspace.getWorkspaceFolder(workspaceFolderUri);
        assert.ok(rootFolder, `Failed to retrieve root workspace folder for scenario ${scenario.label}.`);

        await cleanTestFolder(rootFolder);

        // 1. Create shared workspace project
        scenariosTracker.initScenario(scenario.label);
        scenariosTracker.startCreateNewProject(scenario.label, scenario.createNewProjectTest.label);

        await runWithTestActionContext('scenario.createNewProject', async context => {
            await context.ui.runWithInputs(scenario.createNewProjectTest.inputs, async () => {
                try {
                    await createNewProjectInternal(context, { folderPath: rootFolder.uri.fsPath });
                    await scenario.createNewProjectTest.postTest?.(context);
                    scenariosTracker.passCreateNewProject(scenario.label);
                } catch (err) {
                    scenariosTracker.failCreateNewProject(scenario.label, (err as Error).message ?? parseError(err).message);
                    throw err;
                }
            });
        });

        // 2. Start all create and deploy tests for the scenario
        const createAndDeployTests: CreateAndDeployTestCase[] = testLevel === TestLevel.Basic ? scenario.createAndDeployTests.basic : scenario.createAndDeployTests.extended ?? [];
        const onlyTestCase: CreateAndDeployTestCase | undefined = createAndDeployTests.find(test => test.only);

        if (onlyTestCase) {
            await startCreateAndDeployTest(scenario.label, rootFolder, onlyTestCase);
        } else {
            const createAndDeployTasks: Promise<void>[] = createAndDeployTests.map(test => startCreateAndDeployTest(scenario.label, rootFolder, test));
            await Promise.allSettled(createAndDeployTasks);
        }

        await cleanTestFolder(rootFolder);
    }
}

async function startCreateAndDeployTest(scenarioLabel: string, rootFolder: WorkspaceFolder, test: CreateAndDeployTestCase): Promise<void> {
    const testId: number = scenariosTracker.initCreateAndDeployTest(scenarioLabel);

    for (const rg of test.resourceGroupsToDelete ?? []) {
        resourceGroupsToDelete.add(rg);
    }

    // 3. Create function app
    scenariosTracker.startCreateFunctionApp(scenarioLabel, testId, test.createFunctionApp.label);

    let functionAppId: string;
    await runWithTestActionContext('scenario.createFunctionApp', async context => {
        await context.ui.runWithInputs(test.createFunctionApp.inputs, async () => {
            try {
                if (test.createFunctionApp.mode === CreateMode.Basic) {
                    functionAppId = await createFunctionApp(context);
                } else {
                    functionAppId = await createFunctionAppAdvanced(context);
                }

                assert.ok(functionAppId, 'Failed to create function app.');
                scenariosTracker.passCreateFunctionApp(scenarioLabel, testId);
            } catch (err) {
                scenariosTracker.failCreateFunctionApp(scenarioLabel, testId, (err as Error).message ?? parseError(err).message);
                throw err;
            }
        });
    });

    // 4. Deploy function app
    scenariosTracker.startDeployFunctionApp(scenarioLabel, testId, test.deployFunctionApp.label);

    await runWithTestActionContext('scenario.deploy', async context => {
        await context.ui.runWithInputs(test.deployFunctionApp.inputs, async () => {
            let deployError: unknown;
            try {
                await deployProductionSlotByFunctionAppId(context, functionAppId, rootFolder.uri);
            } catch (err) {
                deployError = err;
            }

            let postTestError: unknown;
            if (test.deployFunctionApp.postTest) {
                try {
                    await test.deployFunctionApp.postTest(context, functionAppId);
                } catch (err) {
                    postTestError = err;
                }
            }

            const error = deployError ?? postTestError;
            if (!error) {
                scenariosTracker.passDeployFunctionApp(scenarioLabel, testId);
                return;
            }

            const errorMessage: string = (error as Error).message ?? parseError(error).message;

            // Warning marker indicates deployment failed but verification still passed.
            // Example of a known issue where this happens: https://github.com/microsoft/vscode-azurefunctions/issues/4859
            if (deployError && !postTestError) {
                scenariosTracker.warnDeployFunctionApp(scenarioLabel, testId, errorMessage);
            } else {
                scenariosTracker.failDeployFunctionApp(scenarioLabel, testId, errorMessage);
            }

            throw error;
        });
    });
}

async function cleanTestFolder(testFolder: WorkspaceFolder) {
    await AzExtFsExtra.emptyDir(testFolder.uri.fsPath);
}

export function getWorkspaceFolderUri(folderName: string): Uri {
    const workspaceFolders: readonly WorkspaceFolder[] | undefined = workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder available.');
    } else {
        for (const workspaceFolder of workspaceFolders) {
            if (workspaceFolder.name === folderName) {
                return workspaceFolder.uri;
            }
        }
    }

    throw new Error(`Unable to find workspace folder "${folderName}"`);
}

export enum TestLevel {
    Basic = 'basic',
    Extended = 'extended',
}
