/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ServiceClient } from '@azure/core-client';
import { createPipelineRequest } from '@azure/core-rest-pipeline';
import { createTestActionContext, runWithTestActionContext, type TestInput } from '@microsoft/vscode-azext-dev';
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { FuncVersion, copyFunctionUrl, createGenericClient, createNewProjectInternal, deployProductionSlot, getRandomHexString, nonNullProp } from '../../extension.bundle';
import { addParallelSuite, runInSeries, type ParallelTest } from '../addParallelSuite';
import { getTestWorkspaceFolder } from '../global.test';
import { defaultTestFuncVersion, getBallerinaValidateOptions, getCSharpValidateOptions, getJavaScriptValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions, validateProject, type IValidateProjectOptions } from '../project/validateProject';
import { getRotatingAuthLevel, getRotatingLocation, getRotatingNodeVersion, getRotatingPythonVersion } from './getRotatingValue';
import { resourceGroupsToDelete } from './global.nightly.test';

interface CreateProjectAndDeployTestCase extends ICreateProjectAndDeployOptions {
    title: string;
    buildMachineOsToSkip?: NodeJS.Platform | NodeJS.Platform[];
}

const testCases: CreateProjectAndDeployTestCase[] = [
    { title: 'JavaScript (Model V3)', ...getJavaScriptValidateOptions(true), createProjectInputs: [/Model V3/], deployInputs: [getRotatingNodeVersion()] },
    { title: 'JavaScript (Model V4)', ...getJavaScriptValidateOptions(true), createProjectInputs: [/Model V4/], deployInputs: [getRotatingNodeVersion()] },
    { title: 'TypeScript (Model V3)', ...getTypeScriptValidateOptions(), createProjectInputs: [/Model V3/], deployInputs: [getRotatingNodeVersion()] },
    { title: 'TypeScript (Model V4)', ...getTypeScriptValidateOptions(), createProjectInputs: [/Model V4/], deployInputs: [getRotatingNodeVersion()] },
    { title: 'Ballerina', ...getBallerinaValidateOptions(), deployInputs: [/java.*11/i] },
    // All C# tests on mac and .NET 6 on windows are consistently timing out for some unknown reason. Will skip for now
    // { title: 'C# .NET Core 3.1', buildMachineOsToSkip: 'darwin', ...getCSharpValidateOptions('netcoreapp3.1'), createProjectInputs: [/net.*3/i], deployInputs: [/net.*3/i], createFunctionInputs: ['Company.Function'] },
    { title: 'C# .NET 6', buildMachineOsToSkip: ['darwin', 'win32'], ...getCSharpValidateOptions('net6.0', FuncVersion.v4), createProjectInputs: [/net.*6/i], deployInputs: [/net.*6/i], createFunctionInputs: ['Company.Function'] },
    { title: 'PowerShell', ...getPowerShellValidateOptions(), deployInputs: [/powershell.*7.4/i] },
    { title: 'Python', buildMachineOsToSkip: 'win32', ...getPythonValidateOptions('.venv'), createProjectInputs: [/3\.7/], deployInputs: [getRotatingPythonVersion()] }
]

const parallelTests: ParallelTest[] = [];
for (const testCase of testCases) {
    const osToSkip = Array.isArray(testCase.buildMachineOsToSkip) ? testCase.buildMachineOsToSkip : [testCase.buildMachineOsToSkip];
    if (!osToSkip.some(o => o === process.platform)) {
        parallelTests.push({
            title: testCase.title,
            callback: async () => {
                await testCreateProjectAndDeploy(testCase);
            }
        });
    }
}

addParallelSuite(parallelTests, {
    title: 'Create Project and Deploy',
    timeoutMS: 7 * 60 * 1000,
    isLongRunning: true
});

interface ICreateProjectAndDeployOptions extends IValidateProjectOptions {
    createProjectInputs?: (string | RegExp | TestInput)[];
    createFunctionInputs?: (string | RegExp | TestInput)[];
    deployInputs?: (string | RegExp | TestInput)[];
}

async function testCreateProjectAndDeploy(options: ICreateProjectAndDeployOptions): Promise<void> {
    const functionName: string = 'func' + getRandomHexString(); // function name must start with a letter

    const testWorkspacePath = getTestWorkspaceFolder();
    await runWithTestActionContext('createNewProject', async context => {
        options.createProjectInputs = options.createProjectInputs || [];
        options.createFunctionInputs = options.createFunctionInputs || [];
        await context.ui.runWithInputs([testWorkspacePath, options.language, ...options.createProjectInputs, /http\s*trigger/i, functionName, ...options.createFunctionInputs, getRotatingAuthLevel()], async () => {
            const createProjectOptions = options.version !== defaultTestFuncVersion ? { version: options.version } : {};
            await createNewProjectInternal(context, createProjectOptions)
        });
    });

    options.excludedPaths = options.excludedPaths || [];
    options.excludedPaths.push('.git'); // Since the workspace is already in a git repo
    await validateProject(testWorkspacePath, options);

    const routePrefix: string = getRandomHexString();
    await addRoutePrefixToProject(testWorkspacePath, routePrefix);

    const appName: string = 'funcBasic' + getRandomHexString();
    resourceGroupsToDelete.push(appName);
    await runWithTestActionContext('deploy', async context => {
        options.deployInputs = options.deployInputs || [];
        await context.ui.runWithInputs([testWorkspacePath, /create new function app/i, appName, ...options.deployInputs, getRotatingLocation()], async () => {
            await deployProductionSlot(context)
        });
    });

    await validateFunctionUrl(appName, functionName, routePrefix);
}

async function addRoutePrefixToProject(testWorkspacePath: string, routePrefix: string): Promise<void> {
    const hostPath: string = path.join(testWorkspacePath, 'host.json');
    const hostJson = await AzExtFsExtra.readJSON<any>(hostPath);
    hostJson.extensions = {
        http: {
            routePrefix
        }
    };
    await AzExtFsExtra.writeJSON(hostPath, hostJson);
}

async function validateFunctionUrl(appName: string, functionName: string, routePrefix: string): Promise<void> {
    // first input matches any item except local project (aka it should match the test subscription)
    const inputs: (string | RegExp)[] = [/^((?!Local Project).)*$/i, appName, functionName];

    let functionUrl: string | undefined;
    await runWithTestActionContext('copyFunctionUrl', async context => {
        await runInSeries('copyFunctionUrl', async () => {
            await vscode.env.clipboard.writeText(''); // Clear the clipboard
            await context.ui.runWithInputs(inputs, async () => {
                await copyFunctionUrl(context);
            });
            functionUrl = await vscode.env.clipboard.readText();
        });
    });

    assert.ok(functionUrl?.includes(routePrefix), `Function url "${functionUrl}" did not include routePrefix "${routePrefix}".`);

    const client: ServiceClient = await createGenericClient(await createTestActionContext(), undefined);
    const response = await client.sendRequest(createPipelineRequest({ method: 'POST', url: functionUrl!, body: JSON.stringify({ name: "World" }) }));
    const body: string = nonNullProp(response, 'bodyAsText');
    assert.ok((body.includes('Hello') && body.includes('World')) || body.includes('Welcome'), 'Expected function response to include "Hello World" or "Welcome"');
}
