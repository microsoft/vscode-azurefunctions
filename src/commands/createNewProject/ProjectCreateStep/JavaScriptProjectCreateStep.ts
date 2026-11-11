/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type Progress } from 'vscode';
import { functionSubpathSetting, packageJsonFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { confirmOverwriteFile } from '../../../utils/fs';
import { installNodeDependencies } from '../../../utils/nodeJsUtils';
import { isNodeV4Plus } from '../../../utils/programmingModelUtils';
import { getWorkspaceSetting } from '../../../vsCodeConfig/settings';
import { type IProjectWizardContext } from '../IProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';
import { nodeFuncignoreEntries, nodeGitignore } from './scriptProjectIgnoreFiles';

export const azureFunctionsDependency: string = '@azure/functions';
export const azureFunctionsDependencyVersion: string = '^4.0.0';

export class JavaScriptProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = nodeGitignore;
    protected functionSubpath: string;
    protected shouldAddIndexFile: boolean;

    constructor() {
        super();
        this.funcignore.push(...nodeFuncignoreEntries);
        // default functionSubpath value is a string
        this.functionSubpath = getWorkspaceSetting(functionSubpathSetting) as string;
        // index file only supported when using default folder structure
        this.shouldAddIndexFile = this.functionSubpath === 'src/functions';
    }

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await super.executeCore(context, progress);

        const packagePath: string = path.join(context.projectPath, packageJsonFileName);
        if (await confirmOverwriteFile(context, packagePath)) {
            await AzExtFsExtra.writeJSON(packagePath, this.getPackageJson(context));
        }
        await this._installDependencies(context.projectPath);

        if (isNodeV4Plus(context) && this.shouldAddIndexFile) {
            await this.addIndexFile(context);
        }
    }

    private async _installDependencies(projectPath: string): Promise<void> {
        try {
            await installNodeDependencies(projectPath);
        } catch {
            ext.outputChannel.appendLog(localize('npmInstallFailure', 'WARNING: Failed to install packages in your workspace. Run "npm install" manually instead.'));
        }
    }

    protected getPackageJson(context: IProjectWizardContext): { [key: string]: unknown } {
        const packageJson: { [key: string]: unknown } = {
            name: convertToValidPackageName(path.basename(context.projectPath)),
            version: '1.0.0',
            description: '',
            scripts: this.getPackageJsonScripts(context),
            dependencies: this.getPackageJsonDeps(context),
            devDependencies: this.getPackageJsonDevDeps(context)
        };

        if (isNodeV4Plus(context)) {
            if (this.shouldAddIndexFile) {
                packageJson.main = 'src/{index.js,functions/*.js}';
            } else {
                packageJson.main = path.posix.join(this.functionSubpath, '*.js');
            }
        }

        return packageJson;
    }

    protected getPackageJsonScripts(_context: IProjectWizardContext): { [key: string]: string } {
        return {
            start: 'func start',
            test: 'echo \"No tests yet...\"'
        };
    }

    protected getPackageJsonDeps(context: IProjectWizardContext): { [key: string]: string } {
        const deps: { [key: string]: string } = {};
        if (isNodeV4Plus(context)) {
            deps[azureFunctionsDependency] = azureFunctionsDependencyVersion;
        }

        return deps;
    }

    protected getPackageJsonDevDeps(_context: IProjectWizardContext): { [key: string]: string } {
        return {};
    }

    protected async addIndexFile(context: IProjectWizardContext): Promise<void> {
        const indexPath: string = path.join(context.projectPath, 'src', 'index.js');
        if (await confirmOverwriteFile(context, indexPath)) {
            await AzExtFsExtra.writeFile(indexPath, `const { app } = require('@azure/functions');

app.setup({
    enableHttpStream: true,
});
`);
        }
    }
}

/**
 * See https://github.com/microsoft/vscode-azurefunctions/issues/2030
 * We really just want to avoid the red squiggly when users open up a package.json. Since an invalid name shouldn't block users, this is not meant to be an exhaustive validation
 */
export function convertToValidPackageName(name: string): string {
    // convert to lowercase
    return name.toLowerCase()
        // remove leading/trailing whitespace
        .trim()
        // Replace any disallowed characters with a hyphen
        .replace(/[^a-z0-9-\._~]/g, '-')
        // Replace the first character with a hyphen if it's a period or underscore
        .replace(/^(\.|_)/, '-');
}
