/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { commands, Uri } from 'vscode';
import { AzExtTreeItem } from 'vscode-azureextensionui';
import { ext, getRandomHexString, IFunctionBinding, IFunctionJson, ProjectLanguage } from '../extension.bundle';
import { cleanTestWorkspace, createTestActionContext, testUserInput, testWorkspacePath } from './global.test';

suite('Add Binding', async () => {
    let functionJsonPath: string;
    const functionName: string = 'HttpTriggerTest';
    let initialBindingsCount: number;

    suiteSetup(async () => {
        await cleanTestWorkspace();
        await testUserInput.runWithInputs([testWorkspacePath, ProjectLanguage.JavaScript, /http\s*trigger/i, functionName, 'Anonymous'], async () => {
            await commands.executeCommand('azureFunctions.createNewProject');
        });
        functionJsonPath = path.join(testWorkspacePath, functionName, 'function.json');
        assert.ok(await fse.pathExists(functionJsonPath), 'Failed to create project');
        initialBindingsCount = await getBindingsCount();
    });

    suiteTeardown(async () => {
        const finalBindingsCount: number = await getBindingsCount();
        assert.equal(finalBindingsCount, initialBindingsCount + 3, 'Not all expected bindings were added.');
    });

    test('Command Palette', async () => {
        const userInputs: string[] = [functionName];
        // https://github.com/microsoft/vscode-azurefunctions/issues/1586
        const isLoggedOut: boolean = (await ext.azureAccountTreeItem.getCachedChildren(createTestActionContext())).some(s => /(sign in|azure account)/i.test(s.label));
        if (isLoggedOut) {
            userInputs.unshift('Local Project');
        }
        await validateAddBinding([], userInputs);
    });

    test('Uri', async () => {
        await validateAddBinding([Uri.parse(functionJsonPath)], []);
    });

    test('Tree', async () => {
        const treeItem: AzExtTreeItem | undefined = await ext.tree.findTreeItem(`/localProjecttestWorkspace/functions/${functionName}`, createTestActionContext());
        assert.ok(treeItem, 'Failed to find tree item');
        await validateAddBinding([treeItem], []);
    });

    async function getBindingsCount(): Promise<number> {
        const data: IFunctionJson = <IFunctionJson>await fse.readJSON(functionJsonPath);
        // tslint:disable-next-line: strict-boolean-expressions
        return (data.bindings || []).length;
    }

    // tslint:disable-next-line: no-any
    async function validateAddBinding(commandInputs: any[], userInputs: string[]): Promise<void> {
        const bindingType: string = 'HTTP';
        const bindingDirection: string = 'out';
        const bindingName: string = 'binding' + getRandomHexString();
        await testUserInput.runWithInputs([...userInputs, bindingDirection, bindingType, bindingName], async () => {
            await commands.executeCommand('azureFunctions.addBinding', ...commandInputs);
        });

        const data: IFunctionJson = <IFunctionJson>await fse.readJSON(functionJsonPath);
        const binding: IFunctionBinding | undefined = data.bindings && data.bindings.find(b => b.name === bindingName);
        if (!binding) {
            assert.fail(`Failed to find binding "${bindingName}".`);
        } else {
            assert.equal(binding.direction, bindingDirection);
            assert.equal(binding.type, bindingType.toLowerCase()); // For no particular reason, the type is lowercase in function.json
        }
    }
});
