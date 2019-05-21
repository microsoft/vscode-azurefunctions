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
suite('Init Project For VS Code', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(30 * 1000);

    const javaScriptProject: string = 'AutoDetectJavaScriptProject';
    test(javaScriptProject, async () => {
        const projectPath: string = path.join(testFolderPath, javaScriptProject);
        await fse.ensureFile(path.join(projectPath, 'HttpTriggerJS', 'index.js'));
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const javaScriptProjectWithPackageJson: string = 'AutoDetectJavaScriptProjectWithPackageJson';
    test(javaScriptProjectWithPackageJson, async () => {
        const projectPath: string = path.join(testFolderPath, javaScriptProjectWithPackageJson);
        await fse.ensureFile(path.join(projectPath, 'HttpTriggerJS', 'index.js'));
        await fse.ensureFile(path.join(projectPath, 'package.json'));
        await testInitProjectForVSCode(projectPath);
        await validateProject(projectPath, getJavaScriptValidateOptions(true /* hasPackageJson */));
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
        await fse.ensureFile(path.join(projectPath, 'requirements.psd1'));
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

    const goodTasksFile: string = 'Existing Tasks File';
    test(goodTasksFile, async () => {
        const projectPath: string = path.join(testFolderPath, goodTasksFile);
        const filePath: string = path.join(projectPath, '.vscode', 'tasks.json');
        await fse.ensureFile(filePath);
        await fse.writeJSON(filePath, {
            version: "2.0.0",
            tasks: [
                {
                    label: "hello world",
                    command: "echo 'hello world'",
                    type: "shell"
                }
            ]
        });
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        const options: IValidateProjectOptions = getJavaScriptValidateOptions();
        options.expectedTasks.push('hello world');
        await validateProject(projectPath, options);
    });

    const badTasksFile: string = 'Poorly Formed Tasks File';
    test(badTasksFile, async () => {
        const projectPath: string = path.join(testFolderPath, badTasksFile);
        const filePath: string = path.join(projectPath, '.vscode', 'tasks.json');
        await fse.ensureFile(filePath);
        await fse.writeFile(filePath, '{');
        // This should simply prompt the user to overwrite the file since we can't parse it
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript, DialogResponses.yes.title);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const overwriteTask: string = 'Overwrite Existing Task';
    test(overwriteTask, async () => {
        const projectPath: string = path.join(testFolderPath, overwriteTask);
        const filePath: string = path.join(projectPath, '.vscode', 'tasks.json');
        await fse.ensureFile(filePath);
        await fse.writeJSON(filePath, {
            version: "2.0.0",
            tasks: [
                {
                    type: "func",
                    command: "host start"
                }
            ]
        });
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const overwriteMultipleTasks: string = 'Overwrite Multiple Existing Tasks';
    test(overwriteMultipleTasks, async () => {
        const projectPath: string = path.join(testFolderPath, overwriteMultipleTasks);
        await fse.ensureFile(path.join(projectPath, 'package.json'));
        const filePath: string = path.join(projectPath, '.vscode', 'tasks.json');
        await fse.ensureFile(filePath);
        await fse.writeJSON(filePath, {
            version: "2.0.0",
            tasks: [
                {
                    type: "func",
                    command: "host start"
                },
                {
                    type: "shell",
                    label: "npm install",
                    command: "whoops"
                }
            ]
        });
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        await validateProject(projectPath, getJavaScriptValidateOptions(true /* hasPackageJson */));
    });

    const oldTasksFile: string = 'Old Tasks File';
    test(oldTasksFile, async () => {
        const projectPath: string = path.join(testFolderPath, oldTasksFile);
        const filePath: string = path.join(projectPath, '.vscode', 'tasks.json');
        await fse.ensureFile(filePath);
        await fse.writeJSON(filePath, {
            version: "1.0.0",
            tasks: [
                {
                    label: "hello world",
                    command: "echo 'hello world'",
                    type: "shell"
                }
            ]
        });
        // This should simply prompt the user to overwrite the file since the version is old
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript, DialogResponses.yes.title);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const goodLaunchFile: string = 'Existing Launch File';
    test(goodLaunchFile, async () => {
        const projectPath: string = path.join(testFolderPath, goodLaunchFile);
        const filePath: string = path.join(projectPath, '.vscode', 'launch.json');
        await fse.ensureFile(filePath);
        await fse.writeJSON(filePath, {
            version: "0.2.0",
            configurations: [
                {
                    name: "Launch 1",
                    request: "attach",
                    type: "node"
                }
            ]
        });
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        const options: IValidateProjectOptions = getJavaScriptValidateOptions();
        options.expectedDebugConfigs.push('Launch 1');
        await validateProject(projectPath, options);
    });

    const badLaunchFile: string = 'Poorly Formed Launch File';
    test(badLaunchFile, async () => {
        const projectPath: string = path.join(testFolderPath, badLaunchFile);
        const filePath: string = path.join(projectPath, '.vscode', 'launch.json');
        await fse.ensureFile(filePath);
        await fse.writeFile(filePath, '{');
        // This should simply prompt the user to overwrite the file since we can't parse it
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript, DialogResponses.yes.title);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const overwriteConfig: string = 'Overwrite Existing Debug Config';
    test(overwriteConfig, async () => {
        const projectPath: string = path.join(testFolderPath, overwriteConfig);
        const filePath: string = path.join(projectPath, '.vscode', 'launch.json');
        await fse.ensureFile(filePath);
        await fse.writeJSON(filePath, {
            version: "0.2.0",
            configurations: [
                {
                    name: "Attach to Node Functions",
                    type: "node",
                    request: "attach"
                }
            ]
        });
        await testInitProjectForVSCode(projectPath, ProjectLanguage.JavaScript);
        await validateProject(projectPath, getJavaScriptValidateOptions());
    });

    const oldLaunchFile: string = 'Old Launch File';
    test(oldLaunchFile, async () => {
        const projectPath: string = path.join(testFolderPath, oldLaunchFile);
        const filePath: string = path.join(projectPath, '.vscode', 'launch.json');
        await fse.ensureFile(filePath);
        await fse.writeJSON(filePath, {
            version: "0.1.0",
            configurations: [
                {
                    name: "Launch 1",
                    request: "attach",
                    type: "node"
                }
            ]
        });
        // This should simply prompt the user to overwrite the file since the version is old
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
        await initProjectForVSCode({ telemetry: { properties: {}, measurements: {} }, errorHandling: {} }, projectPath);
        assert.equal(inputs.length, 0, `Not all inputs were used: ${inputs}`);
    }
});
