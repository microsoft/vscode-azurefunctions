/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as vscode from 'vscode';
import { TestInput } from 'vscode-azureextensiondev';
import { getRandomHexString, ProjectLanguage, requestUtils } from '../../extension.bundle';
import { cleanTestWorkspace, longRunningTestsEnabled, testUserInput, testWorkspacePath } from '../global.test';
import { getCSharpValidateOptions, getJavaScriptValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions, IValidateProjectOptions, validateProject } from '../project/validateProject';
import { getRotatingAuthLevel, getRotatingLocation, getRotatingNodeVersion, getRotatingPythonVersion } from './getRotatingValue';
import { resourceGroupsToDelete } from './global.nightly.test';

suite('Create Project and Deploy', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(7 * 60 * 1000);

    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
    });

    suiteTeardown(async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        await cleanTestWorkspace();
    });

    test('JavaScript', async () => {
        await testCreateProjectAndDeploy({ ...getJavaScriptValidateOptions(true), deployInputs: [getRotatingNodeVersion()] });
    });

    test('TypeScript', async () => {
        await testCreateProjectAndDeploy({ ...getTypeScriptValidateOptions(), deployInputs: [getRotatingNodeVersion()] });
    });

    test('CSharp', async () => {
        const namespace: string = 'Company.Function';
        await testCreateProjectAndDeploy({ ...getCSharpValidateOptions('testWorkspace', 'netcoreapp2.1'), createFunctionInputs: [namespace] });
    });

    test('PowerShell', async () => {
        await testCreateProjectAndDeploy({ ...getPowerShellValidateOptions() });
    });

    test('Python', async function (this: IHookCallbackContext): Promise<void> {
        // Disabling on Windows until we can get it to work
        if (process.platform === 'win32') {
            this.skip();
        }

        await testCreateProjectAndDeploy({ ...getPythonValidateOptions('.venv'), createProjectInputs: [/3\.6/], deployInputs: [getRotatingPythonVersion()] });
    });
});

interface ICreateProjectAndDeployOptions extends IValidateProjectOptions {
    createProjectInputs?: (string | RegExp | TestInput)[];
    createFunctionInputs?: (string | RegExp | TestInput)[];
    deployInputs?: (string | RegExp | TestInput)[];
}

async function testCreateProjectAndDeploy(options: ICreateProjectAndDeployOptions): Promise<void> {
    const functionName: string = 'func' + getRandomHexString(); // function name must start with a letter
    await cleanTestWorkspace();

    // tslint:disable: strict-boolean-expressions
    options.createProjectInputs = options.createProjectInputs || [];
    options.createFunctionInputs = options.createFunctionInputs || [];
    options.deployInputs = options.deployInputs || [];
    options.excludedPaths = options.excludedPaths || [];
    // tslint:enable: strict-boolean-expressions

    await testUserInput.runWithInputs([testWorkspacePath, options.language, ...options.createProjectInputs, /http\s*trigger/i, functionName, ...options.createFunctionInputs, getRotatingAuthLevel()], async () => {
        await vscode.commands.executeCommand('azureFunctions.createNewProject');
    });
    options.excludedPaths.push('.git'); // Since the workspace is already in a git repo
    await validateProject(testWorkspacePath, options);

    const appName: string = 'funcBasic' + getRandomHexString();
    resourceGroupsToDelete.push(appName);
    await testUserInput.runWithInputs([/create new function app/i, appName, ...options.deployInputs, getRotatingLocation()], async () => {
        await vscode.commands.executeCommand('azureFunctions.deploy');
    });

    await validateFunctionUrl(appName, functionName, options.language);
}

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

    const request: requestUtils.Request = await requestUtils.getDefaultRequest(functionUrl);
    request.body = { name: "World" };
    request.json = true;
    const response: string = await requestUtils.sendRequest(request);
    assert.ok(response.includes('Hello') && response.includes('World'), 'Expected function response to include "Hello" and "World"');
}
