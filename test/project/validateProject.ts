/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as globby from 'globby';
import * as path from 'path';
import { FuncVersion, getContainingWorkspace, IExtensionsJson, ILaunchJson, ITasksJson, ProjectLanguage } from '../../extension.bundle';

const defaultVersion: FuncVersion = FuncVersion.v3;

export function getJavaScriptValidateOptions(hasPackageJson: boolean = false, version: FuncVersion = defaultVersion): IValidateProjectOptions {
    const expectedSettings: { [key: string]: string } = {
        'azureFunctions.projectLanguage': ProjectLanguage.JavaScript,
        'azureFunctions.projectRuntime': version,
        'azureFunctions.deploySubpath': '.',
        'debug.internalConsoleOptions': 'neverOpen',
    };
    const expectedPaths: string[] = [];
    const expectedTasks: string[] = ['host start'];

    if (hasPackageJson) {
        expectedSettings['azureFunctions.preDeployTask'] = 'npm prune (functions)';
        expectedSettings['azureFunctions.postDeployTask'] = 'npm install (functions)';
        expectedPaths.push('package.json');
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
        expectedTasks
    };
}

export function getTypeScriptValidateOptions(version: FuncVersion = defaultVersion): IValidateProjectOptions {
    return {
        language: ProjectLanguage.TypeScript,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.TypeScript,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.deploySubpath': '.',
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
            'npm install (functions)',
            'npm prune (functions)',
            'host start'
        ]
    };
}

export function getCSharpValidateOptions(targetFramework: string, version: FuncVersion = defaultVersion, numCsproj: number = 1): IValidateProjectOptions {
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

export function getFSharpValidateOptions(targetFramework: string, version: FuncVersion = defaultVersion): IValidateProjectOptions {
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

export function getPythonValidateOptions(venvName: string | undefined, version: FuncVersion = defaultVersion): IValidateProjectOptions {
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

export function getJavaValidateOptions(appName: string, version: FuncVersion = defaultVersion): IValidateProjectOptions {
    return {
        language: ProjectLanguage.Java,
        version,
        expectedSettings: {
            'azureFunctions.projectLanguage': ProjectLanguage.Java,
            'azureFunctions.projectRuntime': version,
            'azureFunctions.preDeployTask': 'package (functions)',
            'azureFunctions.deploySubpath': `target/azure-functions/${appName}`,
            "azureFunctions.javaBuildTool": "gradle",
            'debug.internalConsoleOptions': 'neverOpen',
        },
        expectedPaths: [
            'src',
            'pom.xml'
        ],
        expectedExtensionRecs: [
            'vscjava.vscode-java-debug'
        ],
        excludedPaths: [
            '.funcignore'
        ],
        expectedDebugConfigs: [
            'Attach to Java Functions'
        ],
        expectedTasks: [
            'host start',
            'package (functions)'
        ]
    };
}

export function getDotnetScriptValidateOptions(language: ProjectLanguage, version: FuncVersion = defaultVersion): IValidateProjectOptions {
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

export function getPowerShellValidateOptions(version: FuncVersion = defaultVersion): IValidateProjectOptions {
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

export function getCustomValidateOptions(version: FuncVersion = defaultVersion): IValidateProjectOptions {
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

const commonExpectedPaths: string[] = [
    'host.json',
    'local.settings.json',
    '.gitignore',
    '.git',
    '.funcignore',
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
}

export async function validateProject(projectPath: string, options: IValidateProjectOptions): Promise<void> {
    //
    // Validate expected files
    //
    let expectedPaths: ExpectedPath[] = commonExpectedPaths.filter(p1 => !options.excludedPaths || !options.excludedPaths.find(p2 => p1 === p2));
    expectedPaths = expectedPaths.concat(options.expectedPaths);
    await Promise.all(expectedPaths.map(async p => {
        if (typeof p === 'object') {
            const matches = await globby(p.globPattern, { cwd: projectPath })
            assert.equal(matches.length, p.numMatches, `Path "${p.globPattern}" does not have expected matches.`);
        } else {
            assert.ok(await fse.pathExists(path.join(projectPath, p)), `Path "${p}" does not exist.`);
        }
    }));

    //
    // Validate extensions.json
    //
    const recs: string[] = options.expectedExtensionRecs.concat('ms-azuretools.vscode-azurefunctions');
    const extensionsJson: IExtensionsJson = <IExtensionsJson>await fse.readJSON(path.join(projectPath, '.vscode', 'extensions.json'));
    extensionsJson.recommendations = extensionsJson.recommendations || [];
    assert.equal(extensionsJson.recommendations.length, recs.length, "extensions.json doesn't have the expected number of recommendations.");
    for (const rec of recs) {
        assert.ok(extensionsJson.recommendations.find(r => r === rec), `The recommendation "${rec}" was not found in extensions.json.`);
    }

    //
    // Validate settings.json
    //
    const settings: { [key: string]: string | boolean } = <{ [key: string]: string }>await fse.readJSON(path.join(projectPath, '.vscode', 'settings.json'));
    const keys: string[] = Object.keys(options.expectedSettings);
    for (const key of keys) {
        const expectedValue: RegExp | string | boolean | object | undefined = options.expectedSettings[key];
        if (key === 'debug.internalConsoleOptions' && getContainingWorkspace(projectPath)) {
            // skip validating - it will be set in 'test.code-workspace' file instead of '.vscode/settings.json'
        } else if (expectedValue instanceof RegExp) {
            assert.ok(expectedValue.test(settings[key].toString()), `The setting with key "${key}" does not match RegExp "${expectedValue.source}".`);
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
        const launchJson: ILaunchJson = <ILaunchJson>await fse.readJSON(path.join(projectPath, '.vscode', 'launch.json'));
        launchJson.configurations = launchJson.configurations || [];
        assert.equal(launchJson.configurations.length, options.expectedDebugConfigs.length, "launch.json doesn't have the expected number of configs.");
        for (const configName of options.expectedDebugConfigs) {
            assert.ok(launchJson.configurations.find(c => c.name === configName), `The debug config "${configName}" was not found in launch.json.`);
        }
    }

    //
    // Validate tasks.json
    //
    const tasksJson: ITasksJson = <ITasksJson>await fse.readJSON(path.join(projectPath, '.vscode', 'tasks.json'));
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
