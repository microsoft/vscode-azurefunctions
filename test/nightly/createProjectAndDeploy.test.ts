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
import { FuncVersion, ProjectLanguage, copyFunctionUrl, createGenericClient, createNewProjectInternal, deployProductionSlot, getRandomHexString, nonNullProp } from '../../extension.bundle';
import { addParallelSuite, runInSeries, type ParallelTest } from '../addParallelSuite';
import { getTestWorkspaceFolder } from '../global.test';
import { NodeModelInput, NodeModelVersion, PythonModelInput, PythonModelVersion, defaultTestFuncVersion, getCSharpValidateOptions, getJavaScriptValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions, validateProject, type IValidateProjectOptions } from '../project/validateProject';
import { getRotatingAuthLevel, getRotatingLocation, getRotatingNodeVersion, getRotatingPythonVersion } from './getRotatingValue';
import { resourceGroupsToDelete } from './global.nightly.test';

interface CreateProjectAndDeployTestCase extends ICreateProjectAndDeployOptions {
    title: string;
    buildMachineOsToSkip?: NodeJS.Platform | NodeJS.Platform[];
}

const testCases: CreateProjectAndDeployTestCase[] = [
    { title: 'JavaScript (Model V3)', ...getJavaScriptValidateOptions(true), createProjectInputs: [NodeModelInput[NodeModelVersion.v3]], deployInputs: [getRotatingNodeVersion()], languageModelVersion: NodeModelVersion.v3 },
    { title: 'JavaScript (Model V4)', ...getJavaScriptValidateOptions(true, undefined, undefined, undefined, NodeModelVersion.v4), createProjectInputs: [NodeModelInput[NodeModelVersion.v4]], deployInputs: [getRotatingNodeVersion()], languageModelVersion: NodeModelVersion.v4 },
    { title: 'TypeScript (Model V3)', ...getTypeScriptValidateOptions(), createProjectInputs: [NodeModelInput[NodeModelVersion.v3]], deployInputs: [getRotatingNodeVersion()], languageModelVersion: NodeModelVersion.v3 },
    { title: 'TypeScript (Model V4)', ...getTypeScriptValidateOptions({ modelVersion: NodeModelVersion.v4 }), createProjectInputs: [NodeModelInput[NodeModelVersion.v4]], deployInputs: [getRotatingNodeVersion()], languageModelVersion: NodeModelVersion.v4 },
    // Temporarily disable Ballerina tests until we can install Ballerina on the new pipelines
    // https://github.com/microsoft/vscode-azurefunctions/issues/4210
    // { title: 'Ballerina', ...getBallerinaValidateOptions(), createProjectInputs: ["JVM"], deployInputs: [/java.*11/i] },
    { title: 'C# .NET Framework', buildMachineOsToSkip: 'darwin', ...getCSharpValidateOptions('net48'), createProjectInputs: [/net.*Framework/i], deployInputs: [/net.*Framework/i], createFunctionInputs: ['Company.Function'] },
    { title: 'C# .NET 8', ...getCSharpValidateOptions('net8.0', FuncVersion.v4), createProjectInputs: [/net.*8/i], deployInputs: [/net.*8/i], createFunctionInputs: ['Company.Function'] },
    { title: 'PowerShell', ...getPowerShellValidateOptions(), deployInputs: [/powershell.*7.4/i] },
    { title: 'Python (Model V1)', ...getPythonValidateOptions('.venv'), createProjectInputs: [PythonModelInput[PythonModelVersion.v1], /3\.9/], deployInputs: [getRotatingPythonVersion()], languageModelVersion: PythonModelVersion.v1 },
    { title: 'Python (Model V2)', ...getPythonValidateOptions('.venv', undefined, PythonModelVersion.v2), createProjectInputs: [PythonModelInput[PythonModelVersion.v2], /3\.9/], deployInputs: [getRotatingPythonVersion()], languageModelVersion: PythonModelVersion.v2 },
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
        const inputs = [testWorkspacePath, options.language, ...options.createProjectInputs, /http\s*trigger/i, functionName, ...options.createFunctionInputs];
        if (!isNewNodeProgrammingModel(options.language, options.languageModelVersion as NodeModelVersion)) {
            inputs.push(new RegExp(getRotatingAuthLevel(), 'i'))
        }
        await context.ui.runWithInputs(inputs, async () => {
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

function isNewNodeProgrammingModel(language: ProjectLanguage, modelVersion: NodeModelVersion = NodeModelVersion.v3): boolean {
    return isNode(language) && modelVersion >= NodeModelVersion.v4
}

function isNode(language: ProjectLanguage): boolean {
    return language === ProjectLanguage.JavaScript || language === ProjectLanguage.TypeScript;
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
    const inputs: (string | RegExp)[] = [appName, functionName];

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
    // PowerShell functions expect Name capitalized, so we set both
    const response = await client.sendRequest(createPipelineRequest({ method: 'POST', url: functionUrl!, body: JSON.stringify({ name: "World", Name: "World" }) }));
    const body: string = nonNullProp(response, 'bodyAsText');
    assert.ok((body.includes('Hello') && body.includes('World')) || body.includes('Welcome'), 'Expected function response to include "Hello World" or "Welcome"');
}
