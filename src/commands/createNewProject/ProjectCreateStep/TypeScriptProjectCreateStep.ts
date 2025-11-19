/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type Progress } from 'vscode';
import { FuncVersion } from '../../../FuncVersion';
import { tsConfigFileName, tsDefaultOutDir } from '../../../constants';
import { localize } from '../../../localize';
import { confirmOverwriteFile } from '../../../utils/fs';
import { isNodeV4Plus } from '../../../utils/programmingModelUtils';
import { type IProjectWizardContext } from '../IProjectWizardContext';
import { JavaScriptProjectCreateStep } from './JavaScriptProjectCreateStep';


export class TypeScriptProjectCreateStep extends JavaScriptProjectCreateStep {
    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await super.executeCore(context, progress);

        const tsconfigPath: string = path.join(context.projectPath, tsConfigFileName);
        if (await confirmOverwriteFile(context, tsconfigPath)) {
            await AzExtFsExtra.writeJSON(tsconfigPath, {
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

    protected getPackageJson(context: IProjectWizardContext): { [key: string]: unknown } {
        const packageJson = super.getPackageJson(context);
        if (isNodeV4Plus(context)) {
            // this is set in the super class, but we want to override it
            if (this.shouldAddIndexFile) {
                packageJson.main = 'dist/src/{index.js,functions/*.js}';
            } else {
                packageJson.main = path.posix.join('dist', this.functionSubpath, '*.js');
            }
        }

        return packageJson;
    }

    protected getPackageJsonScripts(_context: IProjectWizardContext): { [key: string]: string } {
        const typeScriptPackageJsonScripts: { [key: string]: string } = {
            build: 'tsc',
            watch: 'tsc -w',
            clean: `rimraf ${tsDefaultOutDir}`,
            prestart: 'npm run clean && npm run build',
            start: 'func start',
            test: 'echo \"No tests yet...\"'
        };

        return typeScriptPackageJsonScripts;
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
                nodeTypesVersion = '20';
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

        const devDeps = {};
        if (!isNodeV4Plus(context)) {
            // previous programming model requires @azure/functions as a dev dependency
            devDeps['@azure/functions'] = `^${funcTypesVersion}.0.0`;
        }

        devDeps['@types/node'] = `^${nodeTypesVersion}.x`;
        devDeps['typescript'] = '^5.0.0';
        devDeps['rimraf'] = '^5.0.0';
        return devDeps;
    }

    protected async addIndexFile(context: IProjectWizardContext): Promise<void> {
        const indexPath: string = path.join(context.projectPath, 'src', 'index.ts');
        if (await confirmOverwriteFile(context, indexPath)) {
            await AzExtFsExtra.writeFile(indexPath, `import { app } from '@azure/functions';

app.setup({
    enableHttpStream: true,
});
`);
        }
    }
}
