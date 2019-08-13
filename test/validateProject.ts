/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { extensionPrefix, IExtensionsJson, ILaunchJson, ITasksJson, ProjectLanguage, ProjectRuntime } from '../extension.bundle';

export function getJavaScriptValidateOptions(hasPackageJson: boolean = false): IValidateProjectOptions {
    const expectedSettings: { [key: string]: string } = {
        projectLanguage: ProjectLanguage.JavaScript,
        projectRuntime: ProjectRuntime.v2,
        deploySubpath: '.'
    };
    const expectedPaths: string[] = [];
    const expectedTasks: string[] = ['host start'];

    if (hasPackageJson) {
        expectedSettings.preDeployTask = 'npm prune';
        expectedPaths.push('package.json');
        expectedTasks.push('npm install', 'npm prune');
    }

    return {
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

export function getTypeScriptValidateOptions(): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: ProjectLanguage.TypeScript,
            projectRuntime: ProjectRuntime.v2,
            deploySubpath: '.',
            preDeployTask: 'npm prune'
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
            'npm build',
            'npm install',
            'npm prune',
            'host start'
        ]
    };
}

export function getCSharpValidateOptions(projectName: string, targetFramework: string): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: ProjectLanguage.CSharp,
            projectRuntime: ProjectRuntime.v2,
            preDeployTask: 'publish',
            deploySubpath: `bin/Release/${targetFramework}/publish`
        },
        expectedPaths: [
            `${projectName}.csproj`
        ],
        expectedExtensionRecs: [
            'ms-vscode.csharp'
        ],
        excludedPaths: [
            '.funcignore'
        ],
        expectedDebugConfigs: [
            'Attach to .NET Functions'
        ],
        expectedTasks: [
            'clean',
            'build',
            'clean release',
            'publish',
            'host start'
        ]
    };
}

export function getFSharpValidateOptions(projectName: string, targetFramework: string): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: ProjectLanguage.FSharp,
            projectRuntime: ProjectRuntime.v2,
            preDeployTask: 'publish',
            deploySubpath: `bin/Release/${targetFramework}/publish`
        },
        expectedPaths: [
            `${projectName}.fsproj`
        ],
        expectedExtensionRecs: [
            'ms-vscode.csharp',
            'ionide.ionide-fsharp'
        ],
        excludedPaths: [
            '.funcignore'
        ],
        expectedDebugConfigs: [
            'Attach to .NET Functions'
        ],
        expectedTasks: [
            'clean',
            'build',
            'clean release',
            'publish',
            'host start'
        ]
    };
}

export function getPythonValidateOptions(projectName: string, venvName: string): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: ProjectLanguage.Python,
            projectRuntime: ProjectRuntime.v2,
            preDeployTask: 'func: pack',
            deploySubpath: `${projectName}.zip`,
            pythonVenv: venvName
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
        expectedTasks: [
            'pipInstall',
            'host start'
        ]
    };
}

export function getJavaValidateOptions(appName: string): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: ProjectLanguage.Java,
            projectRuntime: ProjectRuntime.v2,
            preDeployTask: 'package',
            deploySubpath: `target/azure-functions/${appName}/`
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
            'package'
        ]
    };
}

export function getDotnetScriptValidateOptions(language: ProjectLanguage, runtime: ProjectRuntime = ProjectRuntime.v2): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: language,
            projectRuntime: runtime,
            deploySubpath: '.'
        },
        expectedPaths: [
        ],
        expectedExtensionRecs: [
            'ms-vscode.csharp'
        ],
        expectedDebugConfigs: [
            'Attach to .NET Script Functions'
        ],
        expectedTasks: [
            'host start'
        ]
    };
}

export function getPowerShellValidateOptions(): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: ProjectLanguage.PowerShell,
            projectRuntime: ProjectRuntime.v2,
            deploySubpath: '.'
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

export function getScriptValidateOptions(language: string): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: language,
            projectRuntime: ProjectRuntime.v2
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

export interface IValidateProjectOptions {
    expectedSettings: { [key: string]: string | boolean };
    expectedPaths: string[];
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
    let expectedPaths: string[] = commonExpectedPaths.filter(p1 => !options.excludedPaths || !options.excludedPaths.find(p2 => p1 === p2));
    expectedPaths = expectedPaths.concat(options.expectedPaths);
    await Promise.all(expectedPaths.map(async p => {
        assert.equal(await fse.pathExists(path.join(projectPath, p)), true, `Path "${p}" does not exist.`);
    }));

    //
    // Validate extensions.json
    //
    const recs: string[] = options.expectedExtensionRecs.concat('ms-azuretools.vscode-azurefunctions');
    const extensionsJson: IExtensionsJson = <IExtensionsJson>await fse.readJSON(path.join(projectPath, '.vscode', 'extensions.json'));
    // tslint:disable-next-line: strict-boolean-expressions
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
        const value: string | boolean = options.expectedSettings[key];
        assert.equal(settings[`${extensionPrefix}.${key}`], value, `The setting with key "${key}" is not set to value "${value}".`);
    }

    //
    // Validate launch.json
    //
    if (expectedPaths.find(p => p.includes('launch.json'))) {
        const launchJson: ILaunchJson = <ILaunchJson>await fse.readJSON(path.join(projectPath, '.vscode', 'launch.json'));
        // tslint:disable-next-line: strict-boolean-expressions
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
    // tslint:disable-next-line: strict-boolean-expressions
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
