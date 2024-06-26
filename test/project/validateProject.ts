/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as globby from 'globby';
import * as path from 'path';
import { FuncVersion, JavaBuildTool, ProjectLanguage, extensionId, getContainingWorkspace, type IExtensionsJson, type ILaunchJson, type ITasksJson } from '../../extension.bundle';

export const defaultTestFuncVersion: FuncVersion = FuncVersion.v4;

export enum NodeModelVersion {
    v3 = 'Model V3',
    v4 = 'Model V4'
}

export enum PythonModelVersion {
    v1 = 'Model V1',
    v2 = 'Model V2'
}

export function getJavaScriptValidateOptions(hasPackageJson: boolean = false, version: FuncVersion = defaultTestFuncVersion, projectSubpath?: string, workspaceFolder?: string, modelVersion: NodeModelVersion = NodeModelVersion.v3): IValidateProjectOptions {
    const expectedSettings: { [key: string]: string | RegExp } = {
        'azureFunctions.projectLanguage': ProjectLanguage.JavaScript,
        'azureFunctions.projectRuntime': version,
        'azureFunctions.deploySubpath': projectSubpath ?? '.',
        'debug.internalConsoleOptions': 'neverOpen',
    };
    const expectedPaths: string[] = [];
    const expectedTasks: string[] = ['host start'];

    if (modelVersion === NodeModelVersion.v4) {
        expectedSettings['azureFunctions.projectLanguageModel'] = /4/;
    }

    if (hasPackageJson) {
        expectedSettings['azureFunctions.preDeployTask'] = 'npm prune (functions)';
        expectedSettings['azureFunctions.postDeployTask'] = 'npm install (functions)';
        expectedPaths.push(path.join(projectSubpath ?? '.', 'package.json'));
        expectedTasks.push('npm install (functions)', 'npm prune (functions)');
    }

    return {
        language: ProjectLanguage.JavaScript,
        version,
        expectedSettings,
        expectedPaths,
        expectedExtensionRecs: [
        ],
        expectedDebugConfigs: [
            'Attach to Node Functions'
        ],
        expectedTasks,
        excludedPaths: [],
        workspaceFolder
    };
}

export function getTypeScriptValidateOptions(options?: { version?: FuncVersion, missingCleanScript?: boolean, modelVersion?: NodeModelVersion }): IValidateProjectOptions {
    const version = options?.version || defaultTestFuncVersion;
    const result = {
        language: ProjectLanguage.TypeScript,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.TypeScript,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.deploySubpath': '.',
            'azureFunctions.projectLanguageModel': options?.modelVersion === NodeModelVersion.v4 ? /4/ : undefined,
            'azureFunctions.preDeployTask': 'npm prune (functions)',
            'azureFunctions.postDeployTask': 'npm install (functions)',
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedPaths: [
            'tsconfig.json',
            'package.json'
        ],
        expectedExtensionRecs: [
        ],
        expectedDebugConfigs: [
            'Attach to Node Functions'
        ],
        expectedTasks: [
            'npm build (functions)',
            'npm watch (functions)',
            'npm install (functions)',
            'npm prune (functions)',
            'host start'
        ]
    };
    if (!options?.missingCleanScript) {
        result.expectedTasks.push('npm clean (functions)');
    }
    return result;
}

export function getCSharpValidateOptions(targetFramework: string, version: FuncVersion = defaultTestFuncVersion, numCsproj: number = 1): IValidateProjectOptions {
    return {
        language: ProjectLanguage.CSharp,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.CSharp,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.preDeployTask': 'publish (functions)',
            'azureFunctions.deploySubpath': `bin/Release/${targetFramework}/publish`,
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedPaths: [
            { globPattern: '*.csproj', numMatches: numCsproj }
        ],
        expectedExtensionRecs: [
            'ms-dotnettools.csharp'
        ],
        excludedPaths: [
            '.funcignore'
        ],
        expectedDebugConfigs: [
            'Attach to .NET Functions'
        ],
        expectedTasks: [
            'clean (functions)',
            'build (functions)',
            'clean release (functions)',
            'publish (functions)',
            'host start'
        ]
    };
}

export function getFSharpValidateOptions(targetFramework: string, version: FuncVersion = defaultTestFuncVersion): IValidateProjectOptions {
    return {
        language: ProjectLanguage.FSharp,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.FSharp,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.preDeployTask': 'publish (functions)',
            'azureFunctions.deploySubpath': `bin/Release/${targetFramework}/publish`,
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedPaths: [
            { globPattern: '*.fsproj', numMatches: 1 }
        ],
        expectedExtensionRecs: [
            'ms-dotnettools.csharp',
            'ionide.ionide-fsharp'
        ],
        excludedPaths: [
            '.funcignore'
        ],
        expectedDebugConfigs: [
            'Attach to .NET Functions'
        ],
        expectedTasks: [
            'clean (functions)',
            'build (functions)',
            'clean release (functions)',
            'publish (functions)',
            'host start'
        ]
    };
}

export function getPythonValidateOptions(venvName: string | undefined, version: FuncVersion = defaultTestFuncVersion, modelVersion: PythonModelVersion = PythonModelVersion.v1): IValidateProjectOptions {
    const expectedTasks: string[] = ['host start'];
    if (venvName) {
        expectedTasks.push('pip install (functions)');
    }

    return {
        language: ProjectLanguage.Python,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.Python,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.projectLanguageModel': modelVersion === PythonModelVersion.v2 ? /2/ : undefined,
            'azureFunctions.deploySubpath': '.',
            'azureFunctions.scmDoBuildDuringDeployment': true,
            'azureFunctions.pythonVenv': venvName,
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedPaths: [
            'requirements.txt'
        ],
        expectedExtensionRecs: [
            'ms-python.python'
        ],
        expectedDebugConfigs: [
            'Attach to Python Functions'
        ],
        expectedTasks
    };
}

export function getJavaValidateOptions(appName: string, buildTool: string, version: FuncVersion = defaultTestFuncVersion): IValidateProjectOptions {
    return {
        language: ProjectLanguage.Java,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.Java,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.preDeployTask': 'package (functions)',
            'azureFunctions.javaBuildTool': buildTool,
            'azureFunctions.deploySubpath': buildTool === JavaBuildTool.maven ? `target/azure-functions/${appName}` : `build/azure-functions/${appName}`,
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedExtensionRecs: [
            'vscjava.vscode-java-debug'
        ],
        expectedDebugConfigs: [
            'Attach to Java Functions'
        ],
        expectedTasks: [
            'host start',
            'package (functions)'
        ],
        expectedPaths: buildTool === JavaBuildTool.maven ? ['src', 'pom.xml'] : ['build.gradle'],
        excludedPaths: buildTool === JavaBuildTool.maven ? ['.funcignore'] : []
    };
}

export function getBallerinaValidateOptions(version: FuncVersion = defaultTestFuncVersion): IValidateProjectOptions {
    return {
        language: ProjectLanguage.Ballerina,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.Ballerina,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.preDeployTask': 'package (functions)',
            'azureFunctions.deploySubpath': 'target/azure_functions',
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedExtensionRecs: [
            'WSO2.ballerina',
        ],
        expectedDebugConfigs: [
            'Attach to Ballerina Functions'
        ],
        expectedTasks: [
            'func: host start',
            'package (functions)'
        ],
        expectedPaths: ['Ballerina.toml'],
        excludedPaths: [
            '.funcignore'
        ],
    };
}

export function getDotnetScriptValidateOptions(language: ProjectLanguage, version: FuncVersion = defaultTestFuncVersion): IValidateProjectOptions {
    return {
        language,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': language,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.deploySubpath': '.',
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedPaths: [
        ],
        expectedExtensionRecs: [
            'ms-dotnettools.csharp'
        ],
        expectedDebugConfigs: [
            'Attach to .NET Script Functions'
        ],
        expectedTasks: [
            'host start'
        ]
    };
}

export function getPowerShellValidateOptions(version: FuncVersion = defaultTestFuncVersion): IValidateProjectOptions {
    return {
        language: ProjectLanguage.PowerShell,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.PowerShell,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.deploySubpath': '.',
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedPaths: [
            'profile.ps1',
            'requirements.psd1'
        ],
        expectedExtensionRecs: [
            'ms-vscode.PowerShell'
        ],
        expectedDebugConfigs: [
            'Attach to PowerShell Functions'
        ],
        expectedTasks: [
            'host start'
        ]
    };
}

export function getCustomValidateOptions(version: FuncVersion = defaultTestFuncVersion): IValidateProjectOptions {
    return {
        language: ProjectLanguage.Custom,
        displayLanguage: /custom handler/i,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.Custom,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.deploySubpath': '.',
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedPaths: [
        ],
        expectedExtensionRecs: [
        ],
        excludedPaths: [
            '.vscode/launch.json'
        ],
        expectedDebugConfigs: [
        ],
        expectedTasks: [
            'host start'
        ]
    };
}

function getCommonExpectedPaths(projectPath: string, workspaceFolder?: string): string[] {
    let projectRelativePaths = commonExpectedProjectPaths
    if (workspaceFolder) {
        const relativeProjectPath = path.relative(workspaceFolder, projectPath);
        projectRelativePaths = commonExpectedProjectPaths.map(p => path.join(relativeProjectPath, p));
    }
    return commonExpectedRootPaths.concat(projectRelativePaths);
}

const commonExpectedProjectPaths: string[] = [
    'host.json',
    'local.settings.json',
    '.funcignore',
    '.gitignore',
];

const commonExpectedRootPaths: string[] = [
    '.git',
    '.vscode/tasks.json',
    '.vscode/launch.json',
    '.vscode/extensions.json',
    '.vscode/settings.json'
];

type ExpectedPath = string | { globPattern: string; numMatches: number };

export interface IValidateProjectOptions {
    language: ProjectLanguage;
    displayLanguage?: RegExp;
    version: FuncVersion;
    expectedSettings: { [key: string]: string | boolean | object | undefined | RegExp };
    expectedPaths: ExpectedPath[];
    expectedExtensionRecs: string[];
    expectedDebugConfigs: string[];
    expectedTasks: string[];

    /**
     * Any paths listed in commonExpectedPaths that for some reason don't exist for this language
     */
    excludedPaths?: string[];
    workspaceFolder?: string;
}

export async function validateProject(projectPath: string, options: IValidateProjectOptions): Promise<void> {
    const rootPath = options.workspaceFolder ?? projectPath;

    //
    // Validate expected files
    //
    let expectedPaths: ExpectedPath[] = getCommonExpectedPaths(projectPath, options.workspaceFolder).filter(p1 => !options.excludedPaths || !options.excludedPaths.find(p2 => p1 === p2));
    expectedPaths = expectedPaths.concat(options.expectedPaths);
    await Promise.all(expectedPaths.map(async p => {
        if (typeof p === 'object') {
            const matches = await globby(p.globPattern, { cwd: rootPath })
            assert.equal(matches.length, p.numMatches, `Path "${p.globPattern}" does not have expected matches.`);
        } else {
            assert.ok(await AzExtFsExtra.pathExists(path.join(rootPath, p)), `Path "${p}" does not exist.`);
        }
    }));

    //
    // Validate extensions.json
    //
    const recs: string[] = options.expectedExtensionRecs.concat(extensionId);
    const extensionsJson: IExtensionsJson = await AzExtFsExtra.readJSON<IExtensionsJson>(path.join(rootPath, '.vscode', 'extensions.json'));
    extensionsJson.recommendations = extensionsJson.recommendations || [];
    assert.equal(extensionsJson.recommendations.length, recs.length, "extensions.json doesn't have the expected number of recommendations.");
    for (const rec of recs) {
        assert.ok(extensionsJson.recommendations.find(r => r === rec), `The recommendation "${rec}" was not found in extensions.json.`);
    }

    //
    // Validate settings.json
    //
    const settings: { [key: string]: string | boolean } = await AzExtFsExtra.readJSON<{ [key: string]: string }>(path.join(rootPath, '.vscode', 'settings.json'));
    const keys: string[] = Object.keys(options.expectedSettings);
    for (const key of keys) {
        const expectedValue: RegExp | string | boolean | object | undefined = options.expectedSettings[key];
        if (key === 'debug.internalConsoleOptions' && getContainingWorkspace(rootPath)) {
            // skip validating - it will be set in 'test.code-workspace' file instead of '.vscode/settings.json'
        } else if (expectedValue instanceof RegExp) {
            assert.ok(expectedValue.test(settings[key].toString()), `The setting with key "${key}" does not match RegExp "${expectedValue.source}". Setting set to ${settings[key]}.`);
        } else {
            assert.deepStrictEqual(settings[key], expectedValue, `The setting with key "${key}" is not set to value "${expectedValue}".`);
        }
        delete settings[key];
    }
    assert.equal(Object.keys(settings).length, 0, `settings.json has extra settings: ${JSON.stringify(settings)}`);

    //
    // Validate launch.json
    //
    if (expectedPaths.find(p => typeof p === 'string' && p.includes('launch.json'))) {
        const launchJson: ILaunchJson = await AzExtFsExtra.readJSON<ILaunchJson>(path.join(rootPath, '.vscode', 'launch.json'));
        launchJson.configurations = launchJson.configurations || [];
        assert.equal(launchJson.configurations.length, options.expectedDebugConfigs.length, "launch.json doesn't have the expected number of configs.");
        for (const configName of options.expectedDebugConfigs) {
            assert.ok(launchJson.configurations.find(c => c.name === configName), `The debug config "${configName}" was not found in launch.json.`);
        }
    }

    //
    // Validate tasks.json
    //
    const tasksJson: ITasksJson = await AzExtFsExtra.readJSON<ITasksJson>(path.join(rootPath, '.vscode', 'tasks.json'));
    tasksJson.tasks = tasksJson.tasks || [];
    assert.equal(tasksJson.tasks.length, options.expectedTasks.length, "tasks.json doesn't have the expected number of tasks.");
    for (const task of options.expectedTasks) {
        assert.ok(tasksJson.tasks.find(t => t.label === task || t.command === task), `The task "${task}" was not found in tasks.json.`);
    }

    //
    // Validate .gitignore
    //
    const gitignoreContents: string = (await fse.readFile(path.join(projectPath, '.gitignore'))).toString();
    assert.equal(gitignoreContents.indexOf('.vscode'), -1, 'The ".vscode" folder is being ignored.');
}
