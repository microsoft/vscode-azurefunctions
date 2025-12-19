/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { workspace, type Uri, type WorkspaceFolder } from 'vscode';
import { createNewProjectInternal, updateGlobalSetting } from '../../../../extension.bundle';
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
        const createNewProjectInputs = [
            'TypeScript',
            /v4/i,
            /durable functions orchestrator/i,
            'Durable Task Scheduler',
            'dtsFunctionName',
        ];

        await runWithTestActionContext('scenarios.createNewProject', async context => {
            await context.ui.runWithInputs(createNewProjectInputs, async () => {
                await createNewProjectInternal(context, { folderPath: rootFolder?.uri.fsPath });
            });
        });

        // Verify that the right project settings were set

        // Create Function App

        // Deploy
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
