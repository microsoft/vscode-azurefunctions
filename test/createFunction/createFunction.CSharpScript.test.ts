/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, ext, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TestInput, TestUserInput } from '../../extension.bundle';
import { runForAllTemplateSources } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { getDotnetScriptValidateOptions, validateProject } from '../validateProject';
import { FunctionTesterBase } from './FunctionTesterBase';

class CSharpScriptFunctionTester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.CSharpScript;
    public runtime: ProjectRuntime = ProjectRuntime.v1;

    public async validateFunction(testFolder: string, funcName: string): Promise<void> {
        const functionPath: string = path.join(testFolder, funcName);
        assert.equal(await fse.pathExists(path.join(functionPath, 'run.csx')), true, 'run.csx does not exist');
        assert.equal(await fse.pathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
    }
}

suite('Create C# Script ~1 Function Tests', async () => {
    const tester: CSharpScriptFunctionTester = new CSharpScriptFunctionTester();

    suiteSetup(async () => {
        await tester.initAsync();
    });

    const httpTrigger: string = 'HTTP trigger';
    test(httpTrigger, async () => {
        await tester.testCreateFunction(
            httpTrigger,
            TestInput.UseDefaultValue // Use default Authorization level
        );
    });

    // Intentionally testing IoTHub trigger since a partner team plans to use that
    const iotTemplateId: string = 'IoTHubTrigger-CSharp';
    const iotFunctionName: string = 'createFunctionApi';
    const iotFunctionSettings: {} = { connection: 'test_EVENTHUB', path: 'sample-workitems', consumerGroup: '$Default' };

    // https://github.com/Microsoft/vscode-azurefunctions/blob/master/docs/api.md#create-local-function
    test('createFunction API', async () => {
        await runForAllTemplateSources(async (source) => {
            // Intentionally testing IoTHub trigger since a partner team plans to use that
            const projectPath: string = path.join(tester.baseTestFolder, source);
            await runWithFuncSetting(projectLanguageSetting, ProjectLanguage.CSharpScript, async () => {
                await runWithFuncSetting(projectRuntimeSetting, ProjectRuntime.v1, async () => {
                    await vscode.commands.executeCommand('azureFunctions.createFunction', projectPath, iotTemplateId, iotFunctionName, iotFunctionSettings);
                });
            });
            await tester.validateFunction(projectPath, iotFunctionName);
        });
    });

    test('createNewProjectAndFunction API', async () => {
        await runForAllTemplateSources(async (source) => {
            const projectPath: string = path.join(tester.baseTestFolder, source, 'createNewProjectAndFunction');
            ext.ui = new TestUserInput([DialogResponses.skipForNow.title]);
            await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, 'C#Script', '~1', false /* openFolder */, iotTemplateId, iotFunctionName, iotFunctionSettings);
            await tester.validateFunction(projectPath, iotFunctionName);
            await validateProject(projectPath, getDotnetScriptValidateOptions(ProjectLanguage.CSharpScript, ProjectRuntime.v1));
        });
    });
});
