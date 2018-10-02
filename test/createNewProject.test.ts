/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { ISuiteCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext, TestUserInput } from 'vscode-azureextensionui';
import { createNewProject } from '../src/commands/createNewProject/createNewProject';
import { deploySubpathSetting, extensionPrefix, ProjectLanguage } from '../src/constants';
import { ext } from '../src/extensionVariables';
import * as fsUtil from '../src/utils/fs';
import { validateSetting, validateVSCodeProjectFiles } from './initProjectForVSCode.test';

// tslint:disable-next-line:no-function-expression max-func-body-length
suite('Create New Project Tests', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(60 * 1000);
    const testFolderPath: string = path.join(os.tmpdir(), `azFunc.createNewProjectTests${fsUtil.getRandomHexString()}`);

    suiteSetup(async () => {
        await fse.ensureDir(testFolderPath);
    });

    suiteTeardown(async () => {
        await fse.remove(testFolderPath);
    });

    const javaProject: string = 'JavaProject';
    test(javaProject, async () => {
        const projectPath: string = path.join(testFolderPath, javaProject);
        await testCreateNewProject(
            projectPath,
            ProjectLanguage.Java,
            false,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        );
        await validateVSCodeProjectFiles(projectPath);
        assert.equal(await fse.pathExists(path.join(projectPath, 'src')), true, 'src folder does not exist');
        assert.equal(await fse.pathExists(path.join(projectPath, 'pom.xml')), true, 'pom.xml does not exist');
    });

    const javaScriptProject: string = 'JavaScriptProject';
    test(javaScriptProject, async () => {
        const projectPath: string = path.join(testFolderPath, javaScriptProject);
        await testCreateNewProject(projectPath, ProjectLanguage.JavaScript, false);
        await validateVSCodeProjectFiles(projectPath);
    });

    const csharpProject: string = 'CSharpProject';
    test(csharpProject, async () => {
        const projectPath: string = path.join(testFolderPath, csharpProject);
        await testCreateNewProject(projectPath, ProjectLanguage.CSharp, false);
        await validateVSCodeProjectFiles(projectPath);
        const projectName: string = path.basename(projectPath);
        assert.equal(await fse.pathExists(path.join(projectPath, `${projectName}.csproj`)), true, 'csproj does not exist');
        await validateSetting(projectPath, `${extensionPrefix}.${deploySubpathSetting}`, 'bin/Release/netstandard2.0/publish');
    });

    const bashProject: string = 'BashProject';
    test(bashProject, async () => {
        const projectPath: string = path.join(testFolderPath, bashProject);
        await testCreateNewProject(projectPath, ProjectLanguage.Bash, true);
        await validateVSCodeProjectFiles(projectPath, false);
    });

    const batchProject: string = 'BatchProject';
    test(batchProject, async () => {
        const projectPath: string = path.join(testFolderPath, batchProject);
        await testCreateNewProject(projectPath, ProjectLanguage.Batch, true);
        await validateVSCodeProjectFiles(projectPath, false);
    });

    const csharpScriptProject: string = 'CSharpScriptProject';
    test(csharpScriptProject, async () => {
        const projectPath: string = path.join(testFolderPath, csharpScriptProject);
        await testCreateNewProject(projectPath, ProjectLanguage.CSharpScript, true);
        await validateVSCodeProjectFiles(projectPath);
    });

    const fsharpScriptProject: string = 'FSharpScriptProject';
    test(fsharpScriptProject, async () => {
        const projectPath: string = path.join(testFolderPath, fsharpScriptProject);
        await testCreateNewProject(projectPath, ProjectLanguage.FSharpScript, true);
        await validateVSCodeProjectFiles(projectPath, false);
    });

    const phpProject: string = 'PHPProject';
    test(phpProject, async () => {
        const projectPath: string = path.join(testFolderPath, phpProject);
        await testCreateNewProject(projectPath, ProjectLanguage.PHP, true);
        await validateVSCodeProjectFiles(projectPath, false);
    });

    const powerShellProject: string = 'PowerShellProject';
    test(powerShellProject, async () => {
        const projectPath: string = path.join(testFolderPath, powerShellProject);
        await testCreateNewProject(projectPath, ProjectLanguage.PowerShell, true);
        await validateVSCodeProjectFiles(projectPath, false);
    });

    /*  Temporarily disabled: https://github.com/Microsoft/vscode-azurefunctions/issues/542
        const pythonProject: string = 'PythonProject';
        test(pythonProject, async () => {
            const projectPath: string = path.join(testFolderPath, pythonProject);
            await installFuncCoreTools(PackageManager.npm);
            await testCreateNewProject(projectPath, ProjectLanguage.Python, true);
            await validateVSCodeProjectFiles(projectPath, false);
        });
    */

    const typeScriptProject: string = 'TypeScriptProject';
    test(typeScriptProject, async () => {
        const projectPath: string = path.join(testFolderPath, typeScriptProject);
        await testCreateNewProject(projectPath, ProjectLanguage.TypeScript, true);
        await validateVSCodeProjectFiles(projectPath, false);
    });

    test('createNewProject API', async () => {
        const projectPath: string = path.join(testFolderPath, 'createNewProjectApi');
        await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, 'JavaScript', '~1', false /* openFolder */);
        await validateVSCodeProjectFiles(projectPath);
    });

    test('createNewProject API C#', async () => {
        // Intentionally testing IoTHub trigger since a partner team plans to use that
        const templateId: string = 'Azure.Function.CSharp.IotHubTrigger.2.x';
        const functionName: string = 'createFunctionApi';
        const namespace: string = 'Company.Function';
        const iotPath: string = 'messages/events';
        const connection: string = 'IoTHub_Setting';
        const projectPath: string = path.join(testFolderPath, 'createNewProjectApiCSharp');
        ext.ui = new TestUserInput([DialogResponses.skipForNow.title]);
        await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, 'C#', '~2', false /* openFolder */, templateId, functionName, { namespace: namespace, Path: iotPath, Connection: connection });
        await validateSetting(projectPath, `${extensionPrefix}.${deploySubpathSetting}`, 'bin/Release/netstandard2.0/publish');
    });

    async function testCreateNewProject(projectPath: string, language: string, previewLanguage: boolean, ...inputs: (string | undefined)[]): Promise<void> {
        if (!previewLanguage) {
            inputs.unshift(language); // Specify the function name
        }

        inputs.unshift(projectPath); // Select the test func app folder
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            inputs.unshift('$(file-directory) Browse...'); // If the test environment has an open workspace, select the 'Browse...' option
        }

        const ui: TestUserInput = new TestUserInput(inputs);
        ext.ui = ui;
        await createNewProject(<IActionContext>{ properties: {}, measurements: {} }, undefined, previewLanguage ? language : undefined, undefined, false);
        assert.equal(inputs.length, 0, 'Not all inputs were used.');

        assert.equal(await fse.pathExists(path.join(projectPath, '.gitignore')), true, '.gitignore does not exist');
        assert.equal(await fse.pathExists(path.join(projectPath, 'host.json')), true, 'host.json does not exist');
        assert.equal(await fse.pathExists(path.join(projectPath, 'local.settings.json')), true, 'function.json does not exist');
        assert.equal(await fse.pathExists(path.join(projectPath, '.git')), true, '.git folder does not exist');
    }
});
