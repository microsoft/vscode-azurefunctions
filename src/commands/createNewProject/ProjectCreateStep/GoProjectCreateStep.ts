/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as path from 'path';
import { type Progress } from 'vscode';
import { ext } from '../../../extensionVariables';
import { validateGoInstalled } from '../../../funcCoreTools/validateGoInstalled';
import { localize } from '../../../localize';
import { cpUtils } from '../../../utils/cpUtils';
import { confirmOverwriteFile } from '../../../utils/fs';
import { type IProjectWizardContext } from '../IProjectWizardContext';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

export class GoProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = goGitignore;

    public async executeCore(context: IProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('initializingGoProject', 'Initializing Go Functions project...') });

        if (!await validateGoInstalled(context, context.projectPath)) {
            throw new UserCancelledError('validateGoInstalled');
        }

        await super.executeCore(context, progress);

        // local.settings.json was written by super; add the Go preview flag
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.localSettingsJson.Values!['FUNCTIONS_CLI_NATIVE_LANGUAGE'] = 'go';
        await AzExtFsExtra.writeJSON(path.join(context.projectPath, 'local.settings.json'), this.localSettingsJson);

        const moduleName: string = path.basename(context.projectPath);

        const mainGoPath: string = path.join(context.projectPath, 'main.go');
        if (await confirmOverwriteFile(context, mainGoPath)) {
            await AzExtFsExtra.writeFile(mainGoPath, goMainTemplate);
        }

        const goModPath: string = path.join(context.projectPath, 'go.mod');
        if (await confirmOverwriteFile(context, goModPath)) {
            await AzExtFsExtra.writeFile(goModPath, getGoModTemplate(moduleName));
        }

        // Generate go.sum so `func start` / `go build` can resolve dependencies immediately.
        await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'go', composeArgs(withArg('mod', 'tidy'))());
    }
}

const goMainTemplate: string = `package main

import (
\t"log"
\t"net/http"

\t"github.com/azure/azure-functions-golang-worker/sdk"
\t"github.com/azure/azure-functions-golang-worker/worker"
)

// HTTPTriggerHandler handles standard HTTP requests
func HTTPTriggerHandler(w http.ResponseWriter, r *http.Request) {
\tlog.Printf("Processing HTTP Trigger for %s", r.URL.Path)
\tw.WriteHeader(http.StatusOK)
\tw.Write([]byte("Hello from Go Worker!"))
}

func main() {
\tapp := sdk.FunctionApp()
\tapp.HTTP("hello", HTTPTriggerHandler,
\t\tsdk.WithMethods("GET", "POST"),
\t\tsdk.WithAuth("anonymous"),
\t)
\tworker.Start(app)
}
`;

function getGoModTemplate(moduleName: string): string {
    return `module ${moduleName}

go 1.24.0

require github.com/azure/azure-functions-golang-worker v0.6.0-preview
`;
}

// Matches the .gitignore that func init --worker-runtime go produces.
const goGitignore: string = `bin/
**/bin/
!Modules/**
obj
csx
.vs
edge
Publish

*.user
*.suo
*.cscfg
*.Cache
project.lock.json

/packages
/TestResults

/tools/NuGet.exe
/App_Data
/secrets
/data
.secrets
appsettings.json
local.settings.json

node_modules
dist

# Local python packages
.python_packages/

# Python Environments
.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/

# Byte-compiled / optimized / DLL files
__pycache__/
*.py[cod]
*$py.class

# Azurite artifacts
__blobstorage__
__queuestorage__
__azurite_db*__.json
`;

