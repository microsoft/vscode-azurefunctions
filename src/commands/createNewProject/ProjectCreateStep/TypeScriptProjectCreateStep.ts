/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { tsConfigFileName, tsDefaultOutDir } from '../../../constants';
import { confirmOverwriteFile, writeFormattedJson } from '../../../utils/fs';
import { IProjectWizardContext } from '../IProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

export class TypeScriptProjectCreateStep extends ScriptProjectCreateStep {
    constructor() {
        super();
        this.funcignore.push('*.js.map', '*.ts', 'tsconfig.json');
    }

    public async executeCore(wizardContext: IProjectWizardContext): Promise<void> {
        await super.executeCore(wizardContext);

        const tsconfigPath: string = path.join(wizardContext.projectPath, tsConfigFileName);
        if (await confirmOverwriteFile(tsconfigPath)) {
            await writeFormattedJson(tsconfigPath, {
                compilerOptions: {
                    module: 'commonjs',
                    target: 'es6',
                    outDir: tsDefaultOutDir,
                    rootDir: '.',
                    sourceMap: true,
                    strict: false
                }
            });
        }

        const packagePath: string = path.join(wizardContext.projectPath, 'package.json');
        if (await confirmOverwriteFile(packagePath)) {
            await writeFormattedJson(packagePath, {
                name: path.basename(wizardContext.projectPath),
                description: '',
                version: '0.1.0',
                scripts: {
                    build: 'tsc',
                    watch: 'tsc -w',
                    prestart: 'npm run build && func extensions install',
                    'start:host': 'func start',
                    start: 'npm run start:host & npm run watch',
                    'build:production': 'npm run prestart && npm prune --production',
                    test: 'echo \"No tests yet...\"'
                },
                dependencies: {},
                devDependencies: {
                    '@azure/functions': '^1.0.1-beta2',
                    typescript: '^3.3.3'
                }
            });

            const packageLockPath: string = path.join(wizardContext.projectPath, 'package-lock.json');
            await writeFormattedJson(packageLockPath, {
                name: path.basename(wizardContext.projectPath),
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
            });
        }
    }
}
