/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Progress } from 'vscode';
import { tsConfigFileName, tsDefaultOutDir } from '../../../constants';
import { FuncVersion } from '../../../FuncVersion';
import { localize } from '../../../localize';
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

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await super.executeCore(context, progress);

        const tsconfigPath: string = path.join(context.projectPath, tsConfigFileName);
        if (await confirmOverwriteFile(context, tsconfigPath)) {
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

    protected getPackageJsonDevDeps(context: IProjectWizardContext): { [key: string]: string } {
        // NOTE: Types package matches node worker version, not func host version
        // See version matrix here: https://www.npmjs.com/package/@azure/functions
        let funcTypesVersion: string;
        // For the node types package, we'll use the latest LTS version possible
        // See version matrix here: https://docs.microsoft.com/azure/azure-functions/functions-versions?pivots=programming-language-javascript#languages
        let nodeTypesVersion: string;
        switch (context.version) {
            case FuncVersion.v4:
                funcTypesVersion = '3';
                nodeTypesVersion = '16';
                break;
            case FuncVersion.v3:
                funcTypesVersion = '2';
                nodeTypesVersion = '14';
                break;
            case FuncVersion.v2:
                funcTypesVersion = '1';
                nodeTypesVersion = '10';
                break;
            default:
                throw new Error(localize('typeScriptNoV1', 'TypeScript projects are not supported on Azure Functions v1.'));
        }

        return {
            '@azure/functions': `^${funcTypesVersion}.0.0`,
            '@types/node': `${nodeTypesVersion}.x`,
            typescript: '^4.0.0',
        };
    }
}
