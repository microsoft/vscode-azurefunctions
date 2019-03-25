/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { extensionPrefix, ProjectLanguage, ProjectRuntime } from '../extension.bundle';

export function getJavaScriptValidateOptions(): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: ProjectLanguage.JavaScript,
            projectRuntime: ProjectRuntime.v2,
            deploySubpath: '.',
            preDeployTask: 'func: extensions install'
        },
        expectedPaths: [
        ],
        expectedExtensionRecs: [
        ]
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
        ]
    };
}

export function getPowerShellValidateOptions(): IValidateProjectOptions {
    return {
        expectedSettings: {
            projectLanguage: ProjectLanguage.PowerShell,
            projectRuntime: ProjectRuntime.v2,
            deploySubpath: '.',
            preDeployTask: 'func: extensions install'
        },
        expectedPaths: [
            'profile.ps1'
        ],
        expectedExtensionRecs: [
            'ms-vscode.PowerShell'
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
    expectedSettings: { [key: string]: string };
    expectedPaths: string[];
    expectedExtensionRecs: string[];

    /**
     * Any paths listed in commonExpectedPaths that for some reason don't exist for this language
     */
    excludedPaths?: string[];
}

export async function validateProject(projectPath: string, options: IValidateProjectOptions): Promise<void> {
    //
    // Validate expected files
    //
    let paths: string[] = commonExpectedPaths.filter(p1 => !options.excludedPaths || !options.excludedPaths.find(p2 => p1 === p2));
    paths = paths.concat(options.expectedPaths);
    await Promise.all(paths.map(async p => {
        assert.equal(await fse.pathExists(path.join(projectPath, p)), true, `Path "${p}" does not exist.`);
    }));

    //
    // Validate extensions.json
    //
    const extensionsContents: string = (await fse.readFile(path.join(projectPath, '.vscode', 'extensions.json'))).toString();
    const recs: string[] = options.expectedExtensionRecs.concat('ms-azuretools.vscode-azurefunctions');
    for (const rec of recs) {
        assert.notEqual(extensionsContents.indexOf(rec), -1, `The extension "${rec}" was not found in extensions.json.`);
    }

    //
    // Validate settings.json
    //
    const settings: { [key: string]: string } = <{ [key: string]: string }>await fse.readJSON(path.join(projectPath, '.vscode', 'settings.json'));
    const keys: string[] = Object.keys(options.expectedSettings);
    for (const key of keys) {
        const value: string = options.expectedSettings[key];
        assert.equal(settings[`${extensionPrefix}.${key}`], value, `The setting with key "${key}" is not set to value "${value}".`);
    }

    //
    // Validate .gitignore
    //
    const gitignoreContents: string = (await fse.readFile(path.join(projectPath, '.gitignore'))).toString();
    assert.equal(gitignoreContents.indexOf('.vscode'), -1, 'The ".vscode" folder is being ignored.');
}
