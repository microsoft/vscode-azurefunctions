/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Progress } from 'vscode';
import { confirmOverwriteFile, writeFormattedJson } from '../../../utils/fs';
import { IProjectWizardContext } from '../IProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

export class JavaScriptProjectCreateStep extends ScriptProjectCreateStep {
    // tslint:disable-next-line: no-use-before-declare
    protected gitignore: string = nodeGitignore;
    protected packageJsonScripts: { [key: string]: string } = { test: 'echo \"No tests yet...\"' };
    protected packageJsonDeps: { [key: string]: string } = {};
    protected packageJsonDevDeps: { [key: string]: string } = {};

    constructor() {
        super();
        this.funcignore.push('*.js.map', '*.ts', 'tsconfig.json');
    }

    public async executeCore(wizardContext: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await super.executeCore(wizardContext, progress);

        const packagePath: string = path.join(wizardContext.projectPath, 'package.json');
        if (await confirmOverwriteFile(packagePath)) {
            await writeFormattedJson(packagePath, {
                name: path.basename(wizardContext.projectPath),
                version: '1.0.0',
                description: '',
                scripts: this.packageJsonScripts,
                dependencies: this.packageJsonDeps,
                devDependencies: this.packageJsonDevDeps
            });
        }
    }
}

// https://raw.githubusercontent.com/github/gitignore/master/Node.gitignore
// tslint:disable-next-line:no-multiline-string
const nodeGitignore: string = `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Diagnostic reports (https://nodejs.org/api/report.html)
report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Directory for instrumented libs generated by jscoverage/JSCover
lib-cov

# Coverage directory used by tools like istanbul
coverage

# nyc test coverage
.nyc_output

# Grunt intermediate storage (https://gruntjs.com/creating-plugins#storing-task-files)
.grunt

# Bower dependency directory (https://bower.io/)
bower_components

# node-waf configuration
.lock-wscript

# Compiled binary addons (https://nodejs.org/api/addons.html)
build/Release

# Dependency directories
node_modules/
jspm_packages/

# TypeScript v1 declaration files
typings/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test

# parcel-bundler cache (https://parceljs.org/)
.cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless/

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TypeScript output
dist
out
`;
