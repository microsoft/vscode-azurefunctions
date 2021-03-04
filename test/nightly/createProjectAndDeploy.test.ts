/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, ServiceClient } from '@azure/ms-rest-js';
import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestInput } from 'vscode-azureextensiondev';
import { createGenericClient, getRandomHexString, nonNullProp } from '../../extension.bundle';
import { cleanTestWorkspace, longRunningTestsEnabled, testUserInput, testWorkspacePath } from '../global.test';
import { getCSharpValidateOptions, getJavaScriptValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions, IValidateProjectOptions, validateProject } from '../project/validateProject';
import { getRotatingAuthLevel, getRotatingLocation, getRotatingNodeVersion, getRotatingPythonVersion } from './getRotatingValue';
import { resourceGroupsToDelete } from './global.nightly.test';

suite('Create Project and Deploy', function (this: Mocha.Suite): void {
    this.timeout(7 * 60 * 1000);

    suiteSetup(async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
    });

    suiteTeardown(async () => {
        if (longRunningTestsEnabled) {
            await cleanTestWorkspace();
        }
    });

    test('JavaScript', async () => {
        await testCreateProjectAndDeploy({ ...getJavaScriptValidateOptions(true), deployInputs: [getRotatingNodeVersion()] });
    });

    test('TypeScript', async () => {
        await testCreateProjectAndDeploy({ ...getTypeScriptValidateOptions(), deployInputs: [getRotatingNodeVersion()] });
    });

    test('C# .NET Core 3.1', async () => {
        const namespace: string = 'Company.Function';
        const net3RegExp = /net.*3/i;
        await testCreateProjectAndDeploy({ ...getCSharpValidateOptions('testWorkspace', 'netcoreapp3.1'), createProjectInputs: [net3RegExp], deployInputs: [net3RegExp], createFunctionInputs: [namespace] });
    });

    test('C# .NET 5', async () => {
        const namespace: string = 'Company.Function';
        const net5RegExp = /net.*5/i;
        await testCreateProjectAndDeploy({ ...getCSharpValidateOptions('testWorkspace', 'net5.0'), createProjectInputs: [net5RegExp], deployInputs: [net5RegExp], createFunctionInputs: [namespace] });
    });

    test('PowerShell', async function (this: Mocha.Context): Promise<void> {
        await testCreateProjectAndDeploy({ ...getPowerShellValidateOptions(), deployInputs: [/powershell.*7/i] });
    });

    test('Python', async function (this: Mocha.Context): Promise<void> {
        // Disabling on Windows until we can get it to work
        if (process.platform === 'win32') {
            this.skip();
        }

        await testCreateProjectAndDeploy({ ...getPythonValidateOptions('.venv'), createProjectInputs: [/3\.7/], deployInputs: [getRotatingPythonVersion()] });
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

    options.createProjectInputs = options.createProjectInputs || [];
    options.createFunctionInputs = options.createFunctionInputs || [];
    options.deployInputs = options.deployInputs || [];
    options.excludedPaths = options.excludedPaths || [];

    await testUserInput.runWithInputs([testWorkspacePath, options.language, ...options.createProjectInputs, /http\s*trigger/i, functionName, ...options.createFunctionInputs, getRotatingAuthLevel()], async () => {
        await vscode.commands.executeCommand('azureFunctions.createNewProject');
    });
    options.excludedPaths.push('.git'); // Since the workspace is already in a git repo
    await validateProject(testWorkspacePath, options);

    const routePrefix: string = getRandomHexString();
    await addRoutePrefixToProject(routePrefix);

    const appName: string = 'funcBasic' + getRandomHexString();
    resourceGroupsToDelete.push(appName);
    await testUserInput.runWithInputs([/create new function app/i, appName, ...options.deployInputs, getRotatingLocation()], async () => {
        await vscode.commands.executeCommand('azureFunctions.deploy');
    });

    await validateFunctionUrl(appName, functionName, routePrefix);
}

async function addRoutePrefixToProject(routePrefix: string): Promise<void> {
    const hostPath: string = path.join(testWorkspacePath, 'host.json');
    const hostJson: any = await fse.readJSON(hostPath);
    hostJson.extensions = {
        http: {
            routePrefix
        }
    };
    await fse.writeJSON(hostPath, hostJson);
}

async function validateFunctionUrl(appName: string, functionName: string, routePrefix: string): Promise<void> {
    // first input matches any item except local project (aka it should match the test subscription)
    const inputs: (string | RegExp)[] = [/^((?!Local Project).)*$/i, appName, functionName];

    await vscode.env.clipboard.writeText(''); // Clear the clipboard
    await testUserInput.runWithInputs(inputs, async () => {
        await vscode.commands.executeCommand('azureFunctions.copyFunctionUrl');
    });
    const functionUrl: string = await vscode.env.clipboard.readText();

    assert.ok(functionUrl.includes(routePrefix), 'Function url did not include routePrefix.');

    const client: ServiceClient = await createGenericClient();
    const response: HttpOperationResponse = await client.sendRequest({ method: 'POST', url: functionUrl, body: { name: "World" } });
    const body: string = nonNullProp(response, 'bodyAsText');
    assert.ok((body.includes('Hello') && body.includes('World')) || body.includes('Welcome'), 'Expected function response to include "Hello World" or "Welcome"');
}
