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
import { DialogResponses, TestUserInput } from 'vscode-azureextensionui';
import { initProjectForVSCode } from '../src/commands/createNewProject/initProjectForVSCode';
import { extensionPrefix, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting } from '../src/ProjectSettings';
import * as fsUtil from '../src/utils/fs';

// tslint:disable-next-line:no-function-expression max-func-body-length
suite('Init Project For VS Code Tests', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(30 * 1000);
    const testFolderPath: string = path.join(os.tmpdir(), `azFunc.initProjectForVSCodeTests${fsUtil.getRandomHexString()}`);
    const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions Test');

    // tslint:disable-next-line:no-function-expression
    suiteSetup(async () => {
        await fse.ensureDir(testFolderPath);
    });

    suiteTeardown(async () => {
        outputChannel.dispose();
        await fse.remove(testFolderPath);
    });

    const javaScriptProject: string = 'AutoDetectJavaScriptProject';
    test(javaScriptProject, async () => {
        const projectPath: string = path.join(testFolderPath, javaScriptProject);
        const indexJsPath: string = path.join(projectPath, 'HttpTriggerJS', 'index.js');
        await fse.ensureFile(indexJsPath);
        await testInitProjectForVSCode(projectPath);
        await validateVSCodeProjectFiles(projectPath);
        await validateSetting(projectPath, `${extensionPrefix}.${projectLanguageSetting}`, ProjectLanguage.JavaScript);
        await validateSetting(projectPath, `${extensionPrefix}.${projectRuntimeSetting}`, ProjectRuntime.one);
    });

    const csharpProject: string = 'AutoDetectCSharpProject';
    test(csharpProject, async () => {
        const projectPath: string = path.join(testFolderPath, csharpProject);
        const csProjPath: string = path.join(projectPath, 'test.csproj');
        await fse.ensureFile(csProjPath);
        await fse.writeFile(csProjPath, '<TargetFramework>netstandard2.0<\/TargetFramework>');
        await testInitProjectForVSCode(projectPath);
        await validateVSCodeProjectFiles(projectPath, true);
        await validateExtensionRecommendation(projectPath, 'ms-vscode.csharp');
        await validateSetting(projectPath, `${extensionPrefix}.${projectLanguageSetting}`, ProjectLanguage.CSharp);
        await validateSetting(projectPath, `${extensionPrefix}.${projectRuntimeSetting}`, ProjectRuntime.beta);
    });

    const javaProject: string = 'AutoDetectJavaProject';
    test(javaProject, async () => {
        const projectPath: string = path.join(testFolderPath, javaProject);
        await fse.ensureFile(path.join(projectPath, 'pom.xml'));
        await testInitProjectForVSCode(projectPath);
        await validateVSCodeProjectFiles(projectPath, true);
        await validateExtensionRecommendation(projectPath, 'vscjava.vscode-java-debug');
        await validateSetting(projectPath, `${extensionPrefix}.${projectLanguageSetting}`, ProjectLanguage.Java);
        await validateSetting(projectPath, `${extensionPrefix}.${projectRuntimeSetting}`, ProjectRuntime.beta);
    });

    const multiLanguageProject: string = 'MultiLanguageProject';
    test(multiLanguageProject, async () => {
        const projectPath: string = path.join(testFolderPath, multiLanguageProject);
        const indexJsPath: string = path.join(projectPath, 'HttpTriggerTS', 'index.ts');
        await fse.ensureFile(indexJsPath);
        const runCsxPath: string = path.join(projectPath, 'HttpTriggerCSX', 'run.csx');
        await fse.ensureFile(runCsxPath);
        // Since this project has multiple languages, the user should be prompted to select the language
        // (In this case the user will select JavaScript)
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        await validateVSCodeProjectFiles(projectPath, false);
        await validateSetting(projectPath, `${extensionPrefix}.${projectLanguageSetting}`, ProjectLanguage.JavaScript);
        await validateSetting(projectPath, `${extensionPrefix}.${projectRuntimeSetting}`, ProjectRuntime.one);
    });

    const goodExtensionFile: string = 'Existing Extensions File';
    test(goodExtensionFile, async () => {
        const projectPath: string = path.join(testFolderPath, goodExtensionFile);
        const extensionsJsonPath: string = path.join(projectPath, '.vscode', 'extensions.json');
        await fse.ensureFile(extensionsJsonPath);
        await fse.writeFile(extensionsJsonPath, '{ "recommendations": [ "testid" ] }');
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        await validateVSCodeProjectFiles(projectPath);
        // Verify the user's existing recommendations didn't get removed
        await validateExtensionRecommendation(projectPath, 'testid');
    });

    const badExtensionsFile: string = 'Poorly Formed Extensions File';
    test(badExtensionsFile, async () => {
        const projectPath: string = path.join(testFolderPath, badExtensionsFile);
        const extensionsJsonPath: string = path.join(projectPath, '.vscode', 'extensions.json');
        await fse.ensureFile(extensionsJsonPath);
        await fse.writeFile(extensionsJsonPath, '{');
        // This should simply prompt the user to overwrite the file since we can't parse it
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript, DialogResponses.yes.title);
        await validateVSCodeProjectFiles(projectPath);
    });

    const goodSettingsFile: string = 'Existing Settings File';
    test(goodSettingsFile, async () => {
        const projectPath: string = path.join(testFolderPath, goodSettingsFile);
        const settingsJsonPath: string = path.join(projectPath, '.vscode', 'settings.json');
        await fse.ensureFile(settingsJsonPath);
        await fse.writeFile(settingsJsonPath, '{ "testSetting": "testValue" }');
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        await validateVSCodeProjectFiles(projectPath);
        // tslint:disable-next-line:no-any
        await validateSetting(projectPath, 'testSetting', 'testValue');
    });

    const badSettingsFile: string = 'Poorly Formed Settings File';
    test(badSettingsFile, async () => {
        const projectPath: string = path.join(testFolderPath, badSettingsFile);
        const settingsJson: string = path.join(projectPath, '.vscode', 'settings.json');
        await fse.ensureFile(settingsJson);
        await fse.writeFile(settingsJson, '{');
        // This should simply prompt the user to overwrite the file since we can't parse it
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript, DialogResponses.yes.title);
        await validateVSCodeProjectFiles(projectPath);
    });

    const badGitignoreFile: string = 'Bad gitignore File';
    test(badGitignoreFile, async () => {
        const projectPath: string = path.join(testFolderPath, badGitignoreFile);
        const gitignorePath: string = path.join(projectPath, '.gitignore');
        await fse.ensureFile(gitignorePath);
        // tslint:disable-next-line:no-multiline-string
        await fse.writeFile(gitignorePath, '.vscode');
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        await validateVSCodeProjectFiles(projectPath);
    });

    async function testInitProjectForVSCode(projectPath: string, ...inputs: (string | undefined)[]): Promise<void> {
        inputs.unshift(projectPath); // Select the test func app folder
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            inputs.unshift('$(file-directory) Browse...'); // If the test environment has an open workspace, select the 'Browse...' option
        }

        const ui: TestUserInput = new TestUserInput(inputs);
        await initProjectForVSCode({ isActivationEvent: 'false', result: 'Succeeded', error: '', errorMessage: '' }, ui, outputChannel);
        assert.equal(inputs.length, 0, 'Not all inputs were used.');
    }
});

// tslint:disable-next-line:export-name
export async function validateVSCodeProjectFiles(projectPath: string, hasLaunchJson: boolean = true): Promise<void> {
    const gitignorePath: string = path.join(projectPath, '.gitignore');
    if (await fse.pathExists(gitignorePath)) {
        const gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();
        assert.equal(gitignoreContents.indexOf('.vscode'), -1, 'The ".vscode" folder is being ignored.');
    }

    const vscodePath: string = path.join(projectPath, '.vscode');
    assert.equal(await fse.pathExists(path.join(vscodePath, 'settings.json')), true, 'settings.json does not exist');

    if (hasLaunchJson) {
        assert.equal(await fse.pathExists(path.join(vscodePath, 'launch.json')), true, 'launch.json does not exist');
    }

    assert.equal(await fse.pathExists(path.join(vscodePath, 'tasks.json')), true, 'tasks.json does not exist');
    await validateExtensionRecommendation(projectPath, 'ms-azuretools.vscode-azurefunctions');
}

async function validateExtensionRecommendation(projectPath: string, extensionId: string): Promise<void> {
    const vscodePath: string = path.join(projectPath, '.vscode');
    const extensionsPath: string = path.join(vscodePath, 'extensions.json');
    assert.equal(await fse.pathExists(extensionsPath), true, 'extensions.json does not exist');
    const extensionsContents: string = (await fse.readFile(extensionsPath)).toString();
    assert.equal(extensionsContents.indexOf(extensionId) !== -1, true, `The extension ${extensionId} should be recommended.`);
}

async function validateSetting(projectPath: string, key: string, value: string): Promise<void> {
    const vscodePath: string = path.join(projectPath, '.vscode');
    const settingsPath: string = path.join(vscodePath, 'settings.json');
    assert.equal(await fse.pathExists(settingsPath), true, 'settings.json does not exist');
    // tslint:disable-next-line:no-any
    const settings: any = await fse.readJSON(settingsPath);
    // tslint:disable-next-line:no-unsafe-any
    assert.equal(settings[key], value, `The setting with "${key}" is not set to value "${value}".`);
}
