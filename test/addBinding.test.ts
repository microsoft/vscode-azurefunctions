/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import { AzExtFsExtra, type AzExtTreeItem } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as path from 'path';
import { Uri } from 'vscode';
import { ProjectLanguage, addBinding, createNewProjectInternal, ext, getRandomHexString, type IFunctionBinding, type IFunctionJson } from '../extension.bundle';
import { cleanTestWorkspace, getTestWorkspaceFolder } from './global.test';

suite('Add Binding', () => {
    let functionJsonPath: string;
    const functionName: string = 'HttpTriggerTest';
    let initialBindingsCount: number;

    suiteSetup(async () => {
        await cleanTestWorkspace();
        const testWorkspacePath = getTestWorkspaceFolder();
        await runWithTestActionContext('createNewProject', async (context) => {
            await context.ui.runWithInputs([testWorkspacePath, ProjectLanguage.JavaScript, 'Model V3', /http\s*trigger/i, functionName, 'Anonymous'], async () => {
                await createNewProjectInternal(context, {});
            });
        })
        functionJsonPath = path.join(testWorkspacePath, functionName, 'function.json');
        assert.ok(await AzExtFsExtra.pathExists(functionJsonPath), 'Failed to create project');
        initialBindingsCount = await getBindingsCount();
    });

    suiteTeardown(async () => {
        const finalBindingsCount: number = await getBindingsCount();
        assert.equal(finalBindingsCount, initialBindingsCount + /* 3
        https://github.com/microsoft/vscode-azurefunctions/issues/3266 */
            1, 'Not all expected bindings were added.');
    });

    test('Command Palette', async function (this: Mocha.Context): Promise<void> {
        // https://github.com/microsoft/vscode-azurefunctions/issues/3266
        this.skip();
        this.timeout(30 * 1000);

        const userInputs: string[] = [functionName];
        userInputs.unshift('Local Project');

        await validateAddBinding(undefined, userInputs);
    });

    test('Uri', async () => {
        await validateAddBinding(Uri.parse(functionJsonPath), []);
    });

    test('Tree', async function (this: Mocha.Context): Promise<void> {
        // https://github.com/microsoft/vscode-azurefunctions/issues/3266
        this.skip();
        const treeItem: AzExtTreeItem | undefined = await ext.rgApi.workspaceResourceTree.findTreeItem(`/localProject0/functions/${functionName}`, await createTestActionContext());
        assert.ok(treeItem, 'Failed to find tree item');
        await validateAddBinding(treeItem, []);
    });

    async function getBindingsCount(): Promise<number> {
        const data: IFunctionJson = await AzExtFsExtra.readJSON<IFunctionJson>(functionJsonPath);
        return (data.bindings || []).length;
    }

    async function validateAddBinding(commandInput: any, userInputs: string[]): Promise<void> {
        const bindingType: string = 'HTTP';
        const bindingDirection: string = 'out';
        const bindingName: string = 'binding' + getRandomHexString();
        await runWithTestActionContext('addBinding', async (context) => {
            await context.ui.runWithInputs([...userInputs, bindingDirection, bindingType, bindingName], async () => {
                await addBinding(context, commandInput as Uri | undefined);
            });
        });

        const data: IFunctionJson = await AzExtFsExtra.readJSON<IFunctionJson>(functionJsonPath);
        const binding: IFunctionBinding | undefined = data.bindings && data.bindings.find(b => b.name === bindingName);
        if (!binding) {
            assert.fail(`Failed to find binding "${bindingName}".`);
        } else {
            assert.equal(binding.direction, bindingDirection);
            assert.equal(binding.type, bindingType.toLowerCase()); // For no particular reason, the type is lowercase in function.json
        }
    }
});
