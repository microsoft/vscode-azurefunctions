/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Progress } from 'vscode';
import { ProjectLanguage, tsConfigFileName, tsDefaultOutDir } from '../../../constants';
import { confirmOverwriteFile } from '../../../utils/fs';
import { IProjectWizardContext } from '../IProjectWizardContext';
import { JavaScriptProjectCreateStep } from './JavaScriptProjectCreateStep';
import { typeScriptPackageJsonScripts } from './TypeScriptProjectCreateStep';

export class NodeProgrammingModelProjectCreateStep extends JavaScriptProjectCreateStep {
    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await super.executeCore(context, progress);

        if (context.language === ProjectLanguage.TypeScript) {
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
    }

    protected getPackageJsonScripts(context: IProjectWizardContext): { [key: string]: string } {
        return context.language === ProjectLanguage.TypeScript
            ? typeScriptPackageJsonScripts :
            super.getPackageJsonScripts(context);
    }

    protected getPackageJson(context: IProjectWizardContext): { [key: string]: unknown } {
        const packageJson = super.getPackageJson(context)
        packageJson.main = context.language === ProjectLanguage.TypeScript ? path.join('dist', 'src', 'functions', ' *.js') : path.join('src', 'functions', ' *.js')
        return packageJson;
    }

    protected getPackageJsonDeps(_context: IProjectWizardContext): { [key: string]: string } {
        return {
            '@azure/functions': '^4.0.0-alpha.3'
        }
    }

    protected getPackageJsonDevDeps(context: IProjectWizardContext): { [key: string]: string } {
        const devDeps: { [key: string]: string } = {};

        // For the node types package, Node.js v18+ is required
        devDeps['@types/node'] = '^18.0.0';
        devDeps['func-cli-nodejs-v4'] = '4.0.4764'
        if (context.language === ProjectLanguage.TypeScript) {
            devDeps.typescript = '^4.0.0';
        }

        return devDeps;
    }
}
