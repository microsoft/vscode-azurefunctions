/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import { AzExtFsExtra, nonNullValue } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { workspace, type Uri, type WorkspaceFolder } from 'vscode';
import { createFunctionApp, createNewProjectInternal, deployProductionSlotByFunctionAppId, getRandomAlphanumericString, updateGlobalSetting } from '../../../../extension.bundle';
import { longRunningTestsEnabled } from '../../../global.test';

let rootFolder: WorkspaceFolder | undefined;

suite.only('Durable Task Scheduler (DTS) Scenarios', function (this: Mocha.Suite): void {
    suiteSetup(async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        const workspaceFolderUri: Uri = getWorkspaceFolderUri('scenarios-dts-tsnode');
        rootFolder = workspace.getWorkspaceFolder(workspaceFolderUri);
        assert.ok(rootFolder, 'Could not retrieve root workspace folder.');

        cleanTestFolder(rootFolder);
        await updateGlobalSetting('groupBy', 'resourceType', 'azureResourceGroups');
    });

    test('Create function should bring down template files and make the necessary workspace changes', async () => {
        const appName: string = getRandomAlphanumericString();
        const createNewProjectInputs = [
            /TypeScript/i,
            /v4/i,
            /Durable Functions Orchestrator/i,
            /Durable Task Scheduler/i,
            'durableHello1',
        ];

        await runWithTestActionContext('scenarios.createNewProject', async context => {
            await context.ui.runWithInputs(createNewProjectInputs, async () => {
                await createNewProjectInternal(context, { folderPath: rootFolder?.uri.fsPath });
            });
        });

        // Verify that the right project settings were set

        // For Loop - Tests for this project:

        // For flex test basic, else test adv?
        const createFunctionAppBasicInputs = [
            nonNullValue(rootFolder?.name),
            appName,
            /West US 2/i,
            /Node\.js 22/i,
            /Managed Identity/i,
        ];

        let functionAppId: string | undefined;
        await runWithTestActionContext('scenarios.createFunctionApp', async context => {
            await context.ui.runWithInputs(createFunctionAppBasicInputs, async () => {
                functionAppId = await createFunctionApp(context);
            });
        });
        assert.ok(functionAppId, 'Failed to create function app.');

        const deployFunctionAppInputs = [
            // Todo: Expand regexp capability for context.ui.showWarningMessage
            'Connect Durable Task Scheduler',
            /Create New Durable Task Scheduler/i,
            appName,
            /Create New Durable Task Hub/i,
            appName,
            /Assign New User[- ]Assigned Identity/i,
            /Create New User[- ]Assigned Identity/i,
            // Todo: Here too
            'Deploy',
        ];
        await runWithTestActionContext('scenarios.deploy', async context => {
            await context.ui.runWithInputs(deployFunctionAppInputs, async () => {
                await deployProductionSlotByFunctionAppId(context, functionAppId, rootFolder?.uri);
            });
        });

        // Post deploy check
    });
});

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
