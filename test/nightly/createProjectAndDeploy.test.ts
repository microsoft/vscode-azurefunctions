/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as request from 'request-promise';
import * as vscode from 'vscode';
import { delay, getRandomHexString, ProjectLanguage } from '../../extension.bundle';
import { longRunningTestsEnabled, testUserInput, testWorkspacePath } from '../global.test';
import { getCSharpValidateOptions, getJavaScriptValidateOptions, getTypeScriptValidateOptions, IValidateProjectOptions, validateProject } from '../validateProject';
import { resourceGroupsToDelete } from './global.nightly.test';

suite('Create Project and Deploy', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(7 * 60 * 1000);

    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
    });

    test('JavaScript', async () => {
        const authLevel: string = 'Function';
        await testCreateProjectAndDeploy([authLevel], getJavaScriptValidateOptions(true), ProjectLanguage.JavaScript);
    });

    test('TypeScript', async () => {
        const authLevel: string = 'Function';
        await testCreateProjectAndDeploy([authLevel], getTypeScriptValidateOptions(), ProjectLanguage.TypeScript);
    });

    test('CSharp', async () => {
        const namespace: string = 'Company.Function';
        const accessRights: string = 'Function';
        await testCreateProjectAndDeploy([namespace, accessRights], getCSharpValidateOptions('testWorkspace', 'netcoreapp2.1'), ProjectLanguage.CSharp);
    });

    async function testCreateProjectAndDeploy(functionInputs: (RegExp | string)[], validateProjectOptions: IValidateProjectOptions, projectLanguage: ProjectLanguage): Promise<void> {
        const functionName: string = 'func' + getRandomHexString(); // function name must start with a letter
        await fse.emptyDir(testWorkspacePath);
        await testUserInput.runWithInputs([testWorkspacePath, projectLanguage, /http\s*trigger/i, functionName, ...functionInputs], async () => {
            await vscode.commands.executeCommand('azureFunctions.createNewProject');
        });
        // tslint:disable-next-line: strict-boolean-expressions
        validateProjectOptions.excludedPaths = validateProjectOptions.excludedPaths || [];
        validateProjectOptions.excludedPaths.push('.git'); // Since the workspace is already in a git repo
        await validateProject(testWorkspacePath, validateProjectOptions);

        const appName: string = getRandomHexString();
        resourceGroupsToDelete.push(appName);
        await testUserInput.runWithInputs([/create new function app/i, appName, 'West US'], async () => {
            await vscode.commands.executeCommand('azureFunctions.deploy');
        });
        await delay(500);

        await validateFunctionUrl(appName, functionName, projectLanguage);
    }
});

async function validateFunctionUrl(appName: string, functionName: string, projectLanguage: ProjectLanguage): Promise<void> {
    const inputs: (string | RegExp)[] = [appName, functionName];
    if (projectLanguage !== ProjectLanguage.CSharp) { // CSharp doesn't support local project tree view
        inputs.unshift(/^((?!Local Project).)*$/i); // match any item except local project
    }

    await vscode.env.clipboard.writeText(''); // Clear the clipboard
    await testUserInput.runWithInputs(inputs, async () => {
        await vscode.commands.executeCommand('azureFunctions.copyFunctionUrl');
    });
    const functionUrl: string = await vscode.env.clipboard.readText();

    const options: request.Options = {
        method: 'GET',
        url: functionUrl,
        body: {
            name: "World"
        },
        json: true
    };
    const response: string = await <Thenable<string>>request(options).promise();
    assert.ok(response.includes('Hello') && response.includes('World'), 'Expected function response to include "Hello" and "World"');
}
