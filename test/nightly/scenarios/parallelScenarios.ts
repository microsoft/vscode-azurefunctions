/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { workspace, type Uri, type WorkspaceFolder } from 'vscode';
import { createFunctionApp, createNewProjectInternal, deployProductionSlotByFunctionAppId, ext } from '../../../extension.bundle';
import { type AzExtFunctionsTestScenario, type CreateAndDeployTestCase } from './testScenarios/AzExtFunctionsTestScenario';
import { generateTestScenarios } from './testScenarios/testScenarios';

export interface AzExtFunctionsParallelTestScenario {
    title: string;
    scenario?: Promise<void>;
    runScenario(): Promise<void>;
}

export function generateParallelScenarios(): AzExtFunctionsParallelTestScenario[] {
    return generateTestScenarios().map(scenario => {
        return {
            title: scenario.label,
            runScenario: runTestScenario(scenario),
        };
    });
}

function runTestScenario(scenario: AzExtFunctionsTestScenario): AzExtFunctionsParallelTestScenario['runScenario'] {
    return async () => {
        const workspaceFolderUri: Uri = getWorkspaceFolderUri(scenario.folderName);
        const rootFolder = workspace.getWorkspaceFolder(workspaceFolderUri);
        assert.ok(rootFolder, `Failed to retrieve root workspace folder for scenario ${scenario.label}.`);

        await cleanTestFolder(rootFolder);

        // 1. Create shared workspace project
        ext.outputChannel.appendLog(`[[[ *** ${scenario.label} - ${scenario.createNewProjectTest.label} *** ]]]`);

        await runWithTestActionContext('scenario.createNewProject', async context => {
            await context.ui.runWithInputs(scenario.createNewProjectTest.inputs, async () => {
                await createNewProjectInternal(context, { folderPath: rootFolder.uri.fsPath });
                await scenario.createNewProjectTest.postTestAssertion?.(context, rootFolder.uri.fsPath, '');
            });
        });

        // 2. Immediately spin off all the create and deploy tests
        const createAndDeployTests: Promise<void>[] = scenario.createAndDeployTests.map(test => startCreateAndDeployTest(scenario.label, rootFolder, test));
        await Promise.allSettled(createAndDeployTests);

        await cleanTestFolder(rootFolder);
    }
}

async function startCreateAndDeployTest(scenarioLabel: string, rootFolder: WorkspaceFolder, test: CreateAndDeployTestCase): Promise<void> {
    // 3. Create function app
    ext.outputChannel.appendLog(`[[[ *** ${scenarioLabel} - ${test.createFunctionApp.label} *** ]]]`);

    let functionAppId: string;
    await runWithTestActionContext('scenario.createFunctionApp', async context => {
        await context.ui.runWithInputs(test.createFunctionApp.inputs, async () => {
            functionAppId = await createFunctionApp(context);
            assert.ok(functionAppId, 'Failed to create function app.');
            test.createFunctionApp.postTest?.(context, functionAppId, '');
        });
    });

    // 4. Deploy function app
    ext.outputChannel.appendLog(`[[[ *** ${scenarioLabel} - ${test.deployFunctionApp.label} *** ]]]`);

    await runWithTestActionContext('scenario.deploy', async context => {
        await context.ui.runWithInputs(test.deployFunctionApp.inputs, async () => {
            await deployProductionSlotByFunctionAppId(context, functionAppId, rootFolder?.uri);
            await test.deployFunctionApp.postTest?.(context, functionAppId, '');
        });
    });
}

async function cleanTestFolder(testFolder: WorkspaceFolder) {
    await AzExtFsExtra.emptyDir(testFolder.uri.fsPath);
}

export function getWorkspaceFolderUri(folderName: string): Uri {
    const workspaceFolders: readonly WorkspaceFolder[] | undefined = workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace is open');
    } else {
        for (const workspaceFolder of workspaceFolders) {
            if (workspaceFolder.name === folderName) {
                return workspaceFolder.uri;
            }
        }
    }

    throw new Error(`Unable to find workspace folder "${folderName}"`);
}
