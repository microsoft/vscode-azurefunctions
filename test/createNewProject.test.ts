/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHookCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestInput } from 'vscode-azureextensiondev';
import { createNewProject, FuncVersion, funcVersionSetting, getRandomHexString, Platform, ProjectLanguage } from '../extension.bundle';
import { createTestActionContext, longRunningTestsEnabled, runForAllTemplateSources, testFolderPath, testUserInput } from './global.test';
import { runWithFuncSetting } from './runWithSetting';
import { getCSharpValidateOptions, getDotnetScriptValidateOptions, getFSharpValidateOptions, getJavaScriptValidateOptions, getJavaValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions, IValidateProjectOptions, validateProject } from './validateProject';

suite('Create New Project', async () => {
    const testCases: ICreateProjectTestCase[] = [
        { validateOptions: getCSharpValidateOptions('C#Project', 'netcoreapp2.1', FuncVersion.v2) },
        { validateOptions: getCSharpValidateOptions('C#Project', 'netcoreapp3.0', FuncVersion.v3) },
        { validateOptions: getFSharpValidateOptions('F#Project', 'netcoreapp2.1', FuncVersion.v2), hiddenLanguage: true },
        { validateOptions: getFSharpValidateOptions('F#Project', 'netcoreapp3.0', FuncVersion.v3), hiddenLanguage: true },
    ];

    // Test cases that are the same for both v2 and v3
    for (const version of [FuncVersion.v2, FuncVersion.v3]) {
        testCases.push(
            { validateOptions: getJavaScriptValidateOptions(true /* hasPackageJson */, version) },
            { validateOptions: getTypeScriptValidateOptions(version) },
            { validateOptions: getPowerShellValidateOptions(version) },
            { validateOptions: getDotnetScriptValidateOptions(ProjectLanguage.CSharpScript, version), hiddenLanguage: true },
            { validateOptions: getDotnetScriptValidateOptions(ProjectLanguage.FSharpScript, version), hiddenLanguage: true },
        );

        // Temporarily disable this test on Linux due to inconsistent failures
        // https://github.com/Microsoft/vscode-azurefunctions/issues/910
        if (os.platform() !== Platform.Linux) {
            testCases.push({ validateOptions: getPythonValidateOptions(version), timeout: 5 * 60 * 1000 });
        }

        const appName: string = 'javaApp';
        testCases.push({
            validateOptions: getJavaValidateOptions(appName, version),
            timeout: 5 * 60 * 1000,
            inputs: [TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, appName]
        });
    }

    for (const testCase of testCases) {
        addTest(testCase);
    }

    // https://github.com/Microsoft/vscode-azurefunctions/blob/master/docs/api.md#create-new-project
    test('createNewProject API', async () => {
        const projectPath: string = path.join(testFolderPath, 'createNewProjectApi');
        await testUserInput.runWithInputs([/skip for now/i], async () => {
            await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, 'JavaScript', '~2', false /* openFolder */);
        });
        await validateProject(projectPath, getJavaScriptValidateOptions(true /* hasPackageJson */));
    });

    // https://github.com/Microsoft/vscode-azurefunctions/blob/master/docs/api.md#create-new-project
    test('createNewProject API C#', async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
        this.timeout(5 * 60 * 1000);
        // Intentionally testing IoTHub trigger since a partner team plans to use that
        const templateId: string = 'Azure.Function.CSharp.IotHubTrigger.2.x';
        const functionName: string = 'createFunctionApi';
        const namespace: string = 'Company.Function';
        const iotPath: string = 'messages/events';
        const connection: string = 'IoTHub_Setting';
        const projectPath: string = path.join(testFolderPath, 'createNewProjectApiCSharp');
        await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, 'C#', '~2', false /* openFolder */, templateId, functionName, { namespace: namespace, Path: iotPath, Connection: connection });
        await validateProject(projectPath, getCSharpValidateOptions('createNewProjectApiCSharp', 'netcoreapp2.1'));
    });
});

interface ICreateProjectTestCase {
    validateOptions: IValidateProjectOptions;
    hiddenLanguage?: boolean;
    timeout?: number;
    inputs?: (string | TestInput)[];
}

function addTest(testCase: ICreateProjectTestCase): void {
    test(`${testCase.validateOptions.language} ${testCase.validateOptions.version}`, async function (this: IHookCallbackContext): Promise<void> {
        if (testCase.timeout !== undefined) {
            if (longRunningTestsEnabled) {
                this.timeout(testCase.timeout);
            } else {
                this.skip();
            }
        }

        await runForAllTemplateSources(async () => {
            // Clone inputs here so we have a different array each time
            const inputs: (string | TestInput | RegExp)[] = testCase.inputs ? [...testCase.inputs] : [];
            const language: ProjectLanguage = testCase.validateOptions.language;
            const projectPath: string = path.join(testFolderPath, getRandomHexString(), language + 'Project');

            if (!testCase.hiddenLanguage) {
                inputs.unshift(language);
            }

            inputs.unshift(projectPath);
            inputs.unshift('$(file-directory) Browse...');

            // All languages except Java support creating a function after creating a project
            // Java needs to fix this issue first: https://github.com/Microsoft/vscode-azurefunctions/issues/81
            if (language !== ProjectLanguage.Java) {
                // don't create function
                inputs.push(/skip for now/i);
            }

            await runWithFuncSetting(funcVersionSetting, testCase.validateOptions.version, async () => {
                await testUserInput.runWithInputs(inputs, async () => {
                    await createNewProject(createTestActionContext(), undefined, testCase.hiddenLanguage ? language : undefined, undefined, false);
                });
            });

            await validateProject(projectPath, testCase.validateOptions);
        });
    });
}
