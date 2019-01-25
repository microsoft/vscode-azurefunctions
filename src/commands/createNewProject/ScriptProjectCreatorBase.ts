/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { func, funcWatchProblemMatcher, gitignoreFileName, hostFileName, hostStartCommand, localSettingsFileName, ProjectRuntime, proxiesFileName, TemplateFilter } from '../../constants';
import { ILocalAppSettings } from '../../LocalAppSettings';
import { confirmOverwriteFile, writeFormattedJson } from "../../utils/fs";
import { ProjectCreatorBase } from './ProjectCreatorBase';

// tslint:disable-next-line:no-multiline-string
const gitignore: string = `bin
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
`;

/**
 * Base class for all projects based on a simple script (i.e. JavaScript, C# Script, Bash, etc.) that don't require compilation
 */
export class ScriptProjectCreatorBase extends ProjectCreatorBase {
    public static defaultRuntime: ProjectRuntime = ProjectRuntime.v1;
    // Default template filter to 'All' since preview languages have not been 'verified'
    public readonly templateFilter: TemplateFilter = TemplateFilter.All;
    public readonly functionsWorkerRuntime: string | undefined;

    public getTasksJson(): {} {
        return {
            version: '2.0.0',
            tasks: [
                {
                    type: func,
                    command: hostStartCommand,
                    problemMatcher: funcWatchProblemMatcher,
                    isBackground: true
                }
            ]
        };
    }

    public async onCreateNewProject(): Promise<void> {
        const hostJsonPath: string = path.join(this.functionAppPath, hostFileName);
        if (await confirmOverwriteFile(hostJsonPath)) {
            const hostJson: {} = {
                version: '2.0'
            };
            await writeFormattedJson(hostJsonPath, hostJson);
        }

        const localSettingsJsonPath: string = path.join(this.functionAppPath, localSettingsFileName);
        if (await confirmOverwriteFile(localSettingsJsonPath)) {
            const localSettingsJson: ILocalAppSettings = {
                IsEncrypted: false,
                Values: {
                    AzureWebJobsStorage: ''
                }
            };

            if (this.functionsWorkerRuntime) {
                // tslint:disable-next-line:no-non-null-assertion
                localSettingsJson.Values!.FUNCTIONS_WORKER_RUNTIME = this.functionsWorkerRuntime;
            }

            await writeFormattedJson(localSettingsJsonPath, localSettingsJson);
        }

        const proxiesJsonPath: string = path.join(this.functionAppPath, proxiesFileName);
        if (await confirmOverwriteFile(proxiesJsonPath)) {
            const proxiesJson: {} = {
                // tslint:disable-next-line:no-http-string
                $schema: 'http://json.schemastore.org/proxies',
                proxies: {}
            };
            await writeFormattedJson(proxiesJsonPath, proxiesJson);
        }

        const gitignorePath: string = path.join(this.functionAppPath, gitignoreFileName);
        if (await confirmOverwriteFile(gitignorePath)) {
            await fse.writeFile(gitignorePath, gitignore);
        }
    }

    public async onInitProjectForVSCode(): Promise<void> {
        // nothing to do here
    }
}
