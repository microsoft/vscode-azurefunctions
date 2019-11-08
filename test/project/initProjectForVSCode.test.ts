/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { ISuiteCallbackContext } from 'mocha';
import * as path from 'path';
import { TestInput } from 'vscode-azureextensiondev';
import { getRandomHexString, initProjectForVSCode, ProjectLanguage } from '../../extension.bundle';
import { createTestActionContext, testFolderPath, testUserInput } from '../global.test';
import { getCSharpValidateOptions, getFSharpValidateOptions, getJavaScriptValidateOptions, getJavaValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions, IValidateProjectOptions, validateProject } from './validateProject';

// tslint:disable-next-line:no-function-expression max-func-body-length
suite('Init Project For VS Code', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(30 * 1000);

    test('JavaScript', async () => {
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles: [['HttpTriggerJs', 'index.js']] });
    });

    test('JavaScript with package.json', async () => {
        await initAndValidateProject({ ...getJavaScriptValidateOptions(true /* hasPackageJson */), mockFiles: [['HttpTriggerJs', 'index.js'], 'package.json'] });
    });

    test('JavaScript with extensions.csproj', async () => {
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles: [['HttpTriggerJs', 'index.js'], 'extensions.csproj'] });
    });

    test('TypeScript', async () => {
        await initAndValidateProject({ ...getTypeScriptValidateOptions(), mockFiles: [['HttpTrigger', 'index.ts'], 'tsconfig.json', 'package.json'] });
    });

    test('C#', async () => {
        const mockFiles: MockFile[] = [{ fsPath: 'test.csproj', contents: '<TargetFramework>netstandard2.0<\/TargetFramework><AzureFunctionsVersion>v2</AzureFunctionsVersion>' }];
        await initAndValidateProject({ ...getCSharpValidateOptions('test', 'netstandard2.0'), mockFiles });
    });

    test('C# with extensions.csproj', async () => {
        const mockFiles: MockFile[] = ['extensions.csproj', { fsPath: 'test.csproj', contents: '<TargetFramework>netstandard2.0<\/TargetFramework><AzureFunctionsVersion>v2</AzureFunctionsVersion>' }];
        await initAndValidateProject({ ...getCSharpValidateOptions('test', 'netstandard2.0'), mockFiles });
    });

    function getMockVenvPath(venvName: string): MockFilePath {
        return process.platform === 'win32' ? [venvName, 'Scripts', 'activate'] : [venvName, 'bin', 'activate'];
    }

    test('Python', async () => {
        const venvName: string = 'testEnv';
        const mockFiles: MockFile[] = [['HttpTrigger', '__init__.py'], 'requirements.txt', getMockVenvPath(venvName)];
        await initAndValidateProject({ ...getPythonValidateOptions(venvName), mockFiles });
    });

    test('F#', async () => {
        const mockFiles: MockFile[] = [{ fsPath: 'test.fsproj', contents: '<TargetFramework>netstandard2.0<\/TargetFramework><AzureFunctionsVersion>v2</AzureFunctionsVersion>' }];
        await initAndValidateProject({ ...getFSharpValidateOptions('test', 'netstandard2.0'), mockFiles });
    });

    test('Java', async () => {
        const appName: string = 'javaApp1';
        const mockFiles: MockFile[] = [
            {
                fsPath: 'pom.xml',
                contents: `<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <properties>
        <functionAppName>${appName}</functionAppName>
    </properties>
</project>`
            },
            { fsPath: 'src', isDir: true }
        ];
        await initAndValidateProject({ ...getJavaValidateOptions(appName), mockFiles });
    });

    test('PowerShell', async () => {
        await initAndValidateProject({ ...getPowerShellValidateOptions(), mockFiles: [['HttpTriggerPS', 'run.ps1'], 'profile.ps1', 'requirements.psd1'] });
    });

    test('Multi-language', async () => {
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles: [['HttpTriggerTS', 'index.ts'], ['HttpTriggerCSX', 'run.csx']], inputs: [ProjectLanguage.JavaScript] });
    });

    test('Multi-function', async () => {
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles: [['HttpTriggerJS1', 'index.js'], ['HttpTriggerJS2', 'index.js']] });
    });

    test('Existing extensions.json', async () => {
        const mockFiles: MockFile[] = [{ fsPath: ['.vscode', 'extensions.json'], contents: { recommendations: ["testid"] } }];
        const options: IInitProjectTestOptions = { ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript] };
        options.expectedExtensionRecs.push('testid');
        await initAndValidateProject(options);
    });

    test('Invalid extensions.json', async () => {
        const mockFiles: MockFile[] = [{ fsPath: ['.vscode', 'extensions.json'], contents: '{' }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript, 'Yes'] });
    });

    test('Existing settings.json', async () => {
        const mockFiles: MockFile[] = [{ fsPath: ['.vscode', 'settings.json'], contents: { "azureFunctions.testSetting": "testValue" } }];
        const options: IInitProjectTestOptions = { ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript] };
        options.expectedSettings['azureFunctions.testSetting'] = 'testValue';
        await initAndValidateProject(options);
    });

    test('Invalid settings.json', async () => {
        const mockFiles: MockFile[] = [{ fsPath: ['.vscode', 'settings.json'], contents: '{' }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript, 'Yes'] });
    });

    test('Existing tasks.json', async () => {
        const mockFiles: MockFile[] = [{
            fsPath: ['.vscode', 'tasks.json'],
            contents: {
                version: "2.0.0",
                tasks: [
                    {
                        label: "hello world",
                        command: "echo 'hello world'",
                        type: "shell"
                    }
                ]
            }
        }];
        const options: IInitProjectTestOptions = { ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript] };
        options.expectedTasks.push('hello world');
        await initAndValidateProject(options);
    });

    test('Invalid tasks.json', async () => {
        const mockFiles: MockFile[] = [{ fsPath: ['.vscode', 'tasks.json'], contents: '{' }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript, 'Yes'] });
    });

    test('Overwrite existing task', async () => {
        const mockFiles: MockFile[] = [{
            fsPath: ['.vscode', 'tasks.json'],
            contents: {
                version: "2.0.0",
                tasks: [
                    {
                        type: "func",
                        command: "host start"
                    }
                ]
            }
        }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript] });
    });

    test('Overwrite multiple tasks', async () => {
        const mockFiles: MockFile[] = ['package.json', {
            fsPath: ['.vscode', 'tasks.json'],
            contents: {
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
            }
        }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(true /* hasPackageJson */), mockFiles, inputs: [ProjectLanguage.JavaScript] });
    });

    test('Old tasks.json', async () => {
        const mockFiles: MockFile[] = [{
            fsPath: ['.vscode', 'tasks.json'],
            contents: {
                version: "1.0.0",
                tasks: [
                    {
                        label: "hello world",
                        command: "echo 'hello world'",
                        type: "shell"
                    }
                ]
            }
        }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript, 'Yes'] });
    });

    test('Existing launch.json', async () => {
        const mockFiles: MockFile[] = [{
            fsPath: ['.vscode', 'launch.json'],
            contents: {
                version: "0.2.0",
                configurations: [
                    {
                        name: "Launch 1",
                        request: "attach",
                        type: "node"
                    }
                ]
            }
        }];
        const options: IInitProjectTestOptions = { ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript] };
        options.expectedDebugConfigs.push('Launch 1');
        await initAndValidateProject(options);
    });

    test('Invalid launch.json', async () => {
        const mockFiles: MockFile[] = [{ fsPath: ['.vscode', 'launch.json'], contents: '{' }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript, 'Yes'] });
    });

    test('Overwrite existing debug config', async () => {
        const mockFiles: MockFile[] = [{
            fsPath: ['.vscode', 'launch.json'],
            contents: {
                version: "0.2.0",
                configurations: [
                    {
                        name: "Attach to Node Functions",
                        type: "node",
                        request: "attach"
                    }
                ]
            }
        }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript] });
    });

    test('Old launch.json', async () => {
        const mockFiles: MockFile[] = [{
            fsPath: ['.vscode', 'launch.json'],
            contents: {
                version: "0.1.0",
                configurations: [
                    {
                        name: "Launch 1",
                        request: "attach",
                        type: "node"
                    }
                ]
            }
        }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript, 'Yes'] });
    });

    test('Invalid gitignore', async () => {
        const mockFiles: MockFile[] = [{ fsPath: '.gitignore', contents: '.vscode' }];
        await initAndValidateProject({ ...getJavaScriptValidateOptions(), mockFiles, inputs: [ProjectLanguage.JavaScript] });
    });
});

type MockFilePath = string | string[];

type MockFile = MockFilePath | { fsPath: MockFilePath; contents?: string | object; isDir?: boolean };

interface IInitProjectTestOptions extends IValidateProjectOptions {
    mockFiles?: MockFile[];
    inputs?: (string | RegExp | TestInput)[];
}

async function initAndValidateProject(options: IInitProjectTestOptions): Promise<void> {
    const projectPath: string = path.join(testFolderPath, getRandomHexString());

    // tslint:disable-next-line: strict-boolean-expressions
    const mockFiles: MockFile[] = options.mockFiles || [];
    mockFiles.push('local.settings.json', 'host.json', '.funcignore', '.gitignore', { fsPath: '.git', isDir: true });

    await Promise.all(mockFiles.map(async mockFile => {
        mockFile = typeof mockFile === 'string' || Array.isArray(mockFile) ? { fsPath: mockFile } : mockFile;

        const subPaths: string[] = typeof mockFile.fsPath === 'string' ? [mockFile.fsPath] : mockFile.fsPath;
        const fullPath: string = path.join(projectPath, ...subPaths);
        mockFile.isDir ? await fse.ensureDir(fullPath) : await fse.ensureFile(fullPath);

        if (typeof mockFile.contents === 'object') {
            await fse.writeJSON(fullPath, mockFile.contents);
        } else if (mockFile.contents) {
            await fse.writeFile(fullPath, mockFile.contents);
        }
    }));

    // tslint:disable-next-line: strict-boolean-expressions
    await testUserInput.runWithInputs(options.inputs || [], async () => {
        await initProjectForVSCode(createTestActionContext(), projectPath);
    });

    await validateProject(projectPath, options);
}
