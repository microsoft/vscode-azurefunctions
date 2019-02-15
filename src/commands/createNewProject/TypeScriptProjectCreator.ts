/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { extInstallTaskName, func, funcWatchProblemMatcher, hostStartCommand, ProjectRuntime, tsConfigFileName, tsDefaultOutDir } from '../../constants';
import { confirmOverwriteFile, writeFormattedJson } from '../../utils/fs';
import { JavaScriptProjectCreator } from "./JavaScriptProjectCreator";

const pruneTaskLabel: string = 'prune';

export class TypeScriptProjectCreator extends JavaScriptProjectCreator {
    public readonly preDeployTask: string = pruneTaskLabel;

    constructor(functionAppPath: string, actionContext: IActionContext, runtime: ProjectRuntime | undefined) {
        super(functionAppPath, actionContext, runtime);
        this.funcignore = this.funcignore.concat('*.js.map', '*.ts', 'tsconfig.json');
    }

    public async onCreateNewProject(): Promise<void> {
        await super.onCreateNewProject();

        const tsconfigPath: string = path.join(this.functionAppPath, tsConfigFileName);
        if (await confirmOverwriteFile(tsconfigPath)) {
            const tsconfigJson: {} = {
                compilerOptions: {
                    module: 'commonjs',
                    target: 'es6',
                    outDir: tsDefaultOutDir,
                    rootDir: '.',
                    sourceMap: true,
                    strict: false
                }
            };
            await writeFormattedJson(tsconfigPath, tsconfigJson);
        }

        const packagePath: string = path.join(this.functionAppPath, 'package.json');
        if (await confirmOverwriteFile(packagePath)) {
            const packageJson: {} = {
                name: path.basename(this.functionAppPath),
                description: '',
                version: '0.1.0',
                scripts: {
                    build: 'tsc',
                    watch: 'tsc -w',
                    test: 'echo \"No tests yet...\"'
                },
                dependencies: {},
                devDependencies: {
                    '@azure/functions': '^1.0.1-beta2',
                    typescript: '^3.3.3'
                }
            };
            await writeFormattedJson(packagePath, packageJson);

            const packageLockJson: {} = {
                name: path.basename(this.functionAppPath),
                version: '0.1.0',
                lockfileVersion: 1,
                requires: true,
                dependencies: {
                    '@azure/functions': {
                        version: '1.0.1-beta2',
                        resolved: 'https://registry.npmjs.org/@azure/functions/-/functions-1.0.1-beta2.tgz',
                        integrity: 'sha512-ewVNxU2fqSCLbLuHwwvcL2ExgYNIhaztgHQfBShM9bpCBlAufTrvqlGnsEMfYv2F+BmJrkvhcDWE7E8cDz4X0g==',
                        dev: true
                    },
                    typescript: {
                        version: '3.3.3',
                        resolved: 'https://registry.npmjs.org/typescript/-/typescript-3.3.3.tgz',
                        integrity: 'sha512-Y21Xqe54TBVp+VDSNbuDYdGw0BpoR/Q6wo/+35M8PAU0vipahnyduJWirxxdxjsAkS7hue53x2zp8gz7F05u0A==',
                        dev: true
                    }
                }
            };
            const packageLockPath: string = path.join(this.functionAppPath, 'package-lock.json');
            await writeFormattedJson(packageLockPath, packageLockJson);
        }
    }

    public getTasksJson(): {} {
        const npmInstallTaskName: string = 'npm: install';
        const npmBuildTaskName: string = 'npm: build';
        return {
            version: '2.0.0',
            tasks: [
                {
                    type: func,
                    command: hostStartCommand,
                    problemMatcher: funcWatchProblemMatcher,
                    isBackground: true,
                    dependsOn: npmBuildTaskName
                },
                {
                    type: 'npm',
                    script: 'build',
                    dependsOn: this.runtime === ProjectRuntime.v1 ? npmInstallTaskName : [extInstallTaskName, npmInstallTaskName],
                    problemMatcher: '$tsc'
                },
                {
                    type: 'shell',
                    label: pruneTaskLabel,
                    command: 'npm prune --production',
                    dependsOn: npmBuildTaskName,
                    problemMatcher: []
                }
            ]
        };
    }
}
