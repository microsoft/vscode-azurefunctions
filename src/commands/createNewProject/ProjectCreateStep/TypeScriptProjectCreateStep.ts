/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Progress } from 'vscode';
import { tsConfigFileName, tsDefaultOutDir } from '../../../constants';
import { confirmOverwriteFile, writeFormattedJson } from '../../../utils/fs';
import { IProjectWizardContext } from '../IProjectWizardContext';
import { JavaScriptProjectCreateStep } from './JavaScriptProjectCreateStep';

export class TypeScriptProjectCreateStep extends JavaScriptProjectCreateStep {
    protected packageJsonScripts: { [key: string]: string } = {
        build: 'tsc',
        watch: 'tsc -w',
        prestart: 'npm run build',
        start: 'func start',
        test: 'echo \"No tests yet...\"'
    };

    protected packageJsonDevDeps: { [key: string]: string } = {
        '@azure/functions': '^1.0.2-beta2',
        typescript: '^3.3.3'
    };

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await super.executeCore(context, progress);

        const tsconfigPath: string = path.join(context.projectPath, tsConfigFileName);
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
    }
}
