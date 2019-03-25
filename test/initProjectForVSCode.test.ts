/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { ISuiteCallbackContext } from 'mocha';
import * as path from 'path';
import { TestInput } from 'vscode-azureextensionui';
import { DialogResponses, ext, initProjectForVSCode, Platform, ProjectLanguage, TestUserInput } from '../extension.bundle';
import { testFolderPath } from './global.test';
import { getCSharpValidateOptions, getFSharpValidateOptions, getJavaScriptValidateOptions, getJavaValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions, IValidateProjectOptions, validateProject } from './validateProject';

// tslint:disable-next-line:no-function-expression max-func-body-length
suite('Init Project For VS Code Tests', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(30 * 1000);

    const javaScriptProject: string = 'AutoDetectJavaScriptProject';
    test(javaScriptProject, async () => {
        const projectPath: string = path.join(testFolderPath, javaScriptProject);
        await fse.ensureFile(path.join(projectPath, 'HttpTriggerJS', 'index.js'));
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const javaScriptProjectWithExtensions: string = 'AutoDetectJavaScriptProjectWithExtensions';
    test(javaScriptProjectWithExtensions, async () => {
        const projectPath: string = path.join(testFolderPath, javaScriptProjectWithExtensions);
        await fse.ensureFile(path.join(projectPath, 'HttpTriggerJS', 'index.js'));
        await fse.ensureFile(path.join(projectPath, 'extensions.csproj'));
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const typeScriptProject: string = 'AutoDetectTypeScriptProject';
    test(typeScriptProject, async () => {
        const projectPath: string = path.join(testFolderPath, typeScriptProject);
        await fse.ensureFile(path.join(projectPath, 'HttpTrigger', 'index.ts'));
        await fse.ensureFile(path.join(projectPath, 'tsconfig.json'));
        await fse.ensureFile(path.join(projectPath, 'package.json'));
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getTypeScriptValidateOptions());
    });

    const csharpProject: string = 'AutoDetectCSharpProject';
    test(csharpProject, async () => {
        const projectPath: string = path.join(testFolderPath, csharpProject);
        const csProjPath: string = path.join(projectPath, 'test.csproj');
        await fse.ensureFile(csProjPath);
        await fse.writeFile(csProjPath, '<TargetFramework>netstandard2.0<\/TargetFramework>');
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getCSharpValidateOptions('test', 'netstandard2.0'));
    });

    const csharpProjectWithExtensions: string = 'AutoDetectCSharpProjectWithExtensions';
    test(csharpProjectWithExtensions, async () => {
        const projectPath: string = path.join(testFolderPath, csharpProjectWithExtensions);
        const csProjPath: string = path.join(projectPath, 'test.csproj');
        await fse.ensureFile(csProjPath);
        await fse.writeFile(csProjPath, '<TargetFramework>netstandard2.0<\/TargetFramework>');
        await fse.ensureFile(path.join(projectPath, 'extensions.csproj'));
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getCSharpValidateOptions('test', 'netstandard2.0'));
    });

    const pythonProject: string = 'AutoDetectPythonProject';
    test(pythonProject, async () => {
        const projectPath: string = path.join(testFolderPath, pythonProject);
        await fse.ensureFile(path.join(projectPath, 'HttpTrigger', '__init__.py'));
        await fse.ensureFile(path.join(projectPath, 'requirements.txt'));
        const venvName: string = 'testEnv';
        if (process.platform === Platform.Windows) {
            await fse.ensureFile(path.join(projectPath, venvName, 'Scripts', 'activate'));
        } else {
            await fse.ensureFile(path.join(projectPath, venvName, 'bin', 'activate'));
        }
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getPythonValidateOptions(pythonProject, venvName));
    });

    const fsharpProject: string = 'AutoDetectFSharpProject';
    test(fsharpProject, async () => {
        const projectPath: string = path.join(testFolderPath, fsharpProject);
        const fsProjPath: string = path.join(projectPath, 'test.fsproj');
        await fse.ensureFile(fsProjPath);
        await fse.writeFile(fsProjPath, '<TargetFramework>netstandard2.0<\/TargetFramework>');
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getFSharpValidateOptions('test', 'netstandard2.0'));
    });

    const javaProject: string = 'AutoDetectJavaProject';
    test(javaProject, async () => {
        const appName: string = 'javaApp1';
        const projectPath: string = path.join(testFolderPath, javaProject);
        const pomXmlPath: string = path.join(projectPath, 'pom.xml');
        await fse.ensureFile(pomXmlPath);
        await fse.writeFile(pomXmlPath, `<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <properties>
        <functionAppName>${appName}</functionAppName>
    </properties>
</project>`);
        await fse.ensureDir(path.join(projectPath, 'src'));
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getJavaValidateOptions(appName));
    });

    const powershellProject: string = 'AutoDetectPowerShellProject';
    test(powershellProject, async () => {
        const projectPath: string = path.join(testFolderPath, powershellProject);
        await fse.ensureFile(path.join(projectPath, 'HttpTriggerPS', 'run.ps1'));
        await fse.ensureFile(path.join(projectPath, 'profile.ps1'));
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getPowerShellValidateOptions());
    });

    const multiLanguageProject: string = 'MultiLanguageProject';
    test(multiLanguageProject, async () => {
        const projectPath: string = path.join(testFolderPath, multiLanguageProject);
        await fse.ensureFile(path.join(projectPath, 'HttpTriggerTS', 'index.ts'));
        await fse.ensureFile(path.join(projectPath, 'HttpTriggerCSX', 'run.csx'));
        // Since this project has multiple languages, the user should be prompted to select the language
        // (In this case the user will select JavaScript)
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const multiFunctionProject: string = 'MultiFunctionProject';
    test(multiFunctionProject, async () => {
        const projectPath: string = path.join(testFolderPath, multiFunctionProject);
        await fse.ensureFile(path.join(projectPath, 'HttpTriggerJS1', 'index.js'));
        await fse.ensureFile(path.join(projectPath, 'HttpTriggerJS2', 'index.js'));
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const goodExtensionFile: string = 'Existing Extensions File';
    test(goodExtensionFile, async () => {
        const projectPath: string = path.join(testFolderPath, goodExtensionFile);
        const extensionsJsonPath: string = path.join(projectPath, '.vscode', 'extensions.json');
        await fse.ensureFile(extensionsJsonPath);
        await fse.writeFile(extensionsJsonPath, '{ "recommendations": [ "testid" ] }');
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        const options: IValidateProjectOptions = getJavaScriptValidateOptions();
        // Verify the user's existing recommendations didn't get removed
        options.expectedExtensionRecs.push('testid');
        await validateProject(projectPath, options);
    });

    const badExtensionsFile: string = 'Poorly Formed Extensions File';
    test(badExtensionsFile, async () => {
        const projectPath: string = path.join(testFolderPath, badExtensionsFile);
        const extensionsJsonPath: string = path.join(projectPath, '.vscode', 'extensions.json');
        await fse.ensureFile(extensionsJsonPath);
        await fse.writeFile(extensionsJsonPath, '{');
        // This should simply prompt the user to overwrite the file since we can't parse it
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript, DialogResponses.yes.title);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const goodSettingsFile: string = 'Existing Settings File';
    test(goodSettingsFile, async () => {
        const projectPath: string = path.join(testFolderPath, goodSettingsFile);
        const settingsJsonPath: string = path.join(projectPath, '.vscode', 'settings.json');
        await fse.ensureFile(settingsJsonPath);
        await fse.writeFile(settingsJsonPath, '{ "azureFunctions.testSetting": "testValue" }');
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        const options: IValidateProjectOptions = getJavaScriptValidateOptions();
        options.expectedSettings.testSetting = 'testValue';
        await validateProject(projectPath, options);
    });

    const badSettingsFile: string = 'Poorly Formed Settings File';
    test(badSettingsFile, async () => {
        const projectPath: string = path.join(testFolderPath, badSettingsFile);
        const settingsJson: string = path.join(projectPath, '.vscode', 'settings.json');
        await fse.ensureFile(settingsJson);
        await fse.writeFile(settingsJson, '{');
        // This should simply prompt the user to overwrite the file since we can't parse it
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript, DialogResponses.yes.title);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const badGitignoreFile: string = 'Bad gitignore File';
    test(badGitignoreFile, async () => {
        const projectPath: string = path.join(testFolderPath, badGitignoreFile);
        const gitignorePath: string = path.join(projectPath, '.gitignore');
        await fse.ensureFile(gitignorePath);
        // tslint:disable-next-line:no-multiline-string
        await fse.writeFile(gitignorePath, '.vscode');
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    async function testInitProjectForVSCode(projectPath: string, ...inputs: (string | TestInput)[]): Promise<void> {
        // create mock files
        await fse.ensureFile(path.join(projectPath, 'local.settings.json'));
        await fse.ensureFile(path.join(projectPath, 'host.json'));
        await fse.ensureFile(path.join(projectPath, '.funcignore'));
        await fse.ensureFile(path.join(projectPath, '.gitignore'));
        await fse.ensureDir(path.join(projectPath, '.git'));

        ext.ui = new TestUserInput(inputs);
        await initProjectForVSCode({ properties: {}, measurements: {} }, projectPath);
        assert.equal(inputs.length, 0, `Not all inputs were used: ${inputs}`);
    }
});
