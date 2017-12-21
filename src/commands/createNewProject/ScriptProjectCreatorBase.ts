/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectRuntime } from '../../ProjectSettings';
import { confirmOverwriteFile } from "../../utils/fs";
import * as fsUtil from '../../utils/fs';
import { IProjectCreator } from './IProjectCreator';

// tslint:disable-next-line:no-multiline-string
const gitignore: string = `bin
obj
csx
.vs
edge
Publish
.vscode

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
`;

/**
 * Base class for all projects based on a simple script (i.e. JavaScript, C# Script, Bash, etc.) that don't require compilation
 */
export abstract class ScriptProjectCreatorBase implements IProjectCreator {
    public abstract getTasksJson(launchTaskId: string, funcProblemMatcher: {}): {};
    public abstract getLaunchJson(launchTaskId: string): {};
    public abstract getRuntime(): ProjectRuntime;

    public async addNonVSCodeFiles(functionAppPath: string): Promise<void> {
        const hostJsonPath: string = path.join(functionAppPath, 'host.json');
        if (await confirmOverwriteFile(hostJsonPath)) {
            const hostJson: {} = {};
            await fsUtil.writeFormattedJson(hostJsonPath, hostJson);
        }

        const localSettingsJsonPath: string = path.join(functionAppPath, 'local.settings.json');
        if (await confirmOverwriteFile(localSettingsJsonPath)) {
            const localSettingsJson: {} = {
                IsEncrypted: false,
                Values: {
                    AzureWebJobsStorage: ''
                }
            };
            await fsUtil.writeFormattedJson(localSettingsJsonPath, localSettingsJson);
        }

        const gitignorePath: string = path.join(functionAppPath, '.gitignore');
        if (await confirmOverwriteFile(gitignorePath)) {
            await fse.writeFile(gitignorePath, gitignore);
        }
    }
}
