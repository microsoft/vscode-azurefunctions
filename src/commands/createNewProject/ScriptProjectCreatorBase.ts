/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { gitignoreFileName, hostFileName, localSettingsFileName, ProjectRuntime, TemplateFilter } from '../../constants';
import { tryGetLocalRuntimeVersion } from '../../funcCoreTools/tryGetLocalRuntimeVersion';
import { ILocalAppSettings } from '../../LocalAppSettings';
import { confirmOverwriteFile } from "../../utils/fs";
import * as fsUtil from '../../utils/fs';
import { funcHostProblemMatcher, funcHostTaskId, funcHostTaskLabel, ProjectCreatorBase } from './IProjectCreator';

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
`;

/**
 * Base class for all projects based on a simple script (i.e. JavaScript, C# Script, Bash, etc.) that don't require compilation
 */
export class ScriptProjectCreatorBase extends ProjectCreatorBase {
    public static defaultRuntime: ProjectRuntime = ProjectRuntime.one;
    // Default template filter to 'All' since preview languages have not been 'verified'
    public readonly templateFilter: TemplateFilter = TemplateFilter.All;
    public readonly functionsWorkerRuntime: string | undefined;

    public async getRuntime(): Promise<ProjectRuntime> {
        // tslint:disable-next-line:strict-boolean-expressions
        return await tryGetLocalRuntimeVersion() || ScriptProjectCreatorBase.defaultRuntime;
    }

    public getTasksJson(): {} {
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: funcHostTaskLabel,
                    identifier: funcHostTaskId,
                    type: 'shell',
                    command: 'func host start',
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: [
                        funcHostProblemMatcher
                    ]
                }
            ]
        };
    }

    public async addNonVSCodeFiles(): Promise<void> {
        const hostJsonPath: string = path.join(this.functionAppPath, hostFileName);
        if (await confirmOverwriteFile(hostJsonPath, this.ui)) {
            const hostJson: {} = {};
            await fsUtil.writeFormattedJson(hostJsonPath, hostJson);
        }

        const localSettingsJsonPath: string = path.join(this.functionAppPath, localSettingsFileName);
        if (await confirmOverwriteFile(localSettingsJsonPath, this.ui)) {
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

            await fsUtil.writeFormattedJson(localSettingsJsonPath, localSettingsJson);
        }

        // Temporarily disabling due to https://github.com/Azure/azure-functions-core-tools/issues/562
        /*
        const proxiesJsonPath: string = path.join(this.functionAppPath, proxiesFileName);
        if (await confirmOverwriteFile(proxiesJsonPath, this.ui)) {
            const proxiesJson: {} = {
                // tslint:disable-next-line:no-http-string
                $schema: 'http://json.schemastore.org/proxies',
                proxies: {}
            };
            await fsUtil.writeFormattedJson(proxiesJsonPath, proxiesJson);
        }
        */

        const gitignorePath: string = path.join(this.functionAppPath, gitignoreFileName);
        if (await confirmOverwriteFile(gitignorePath, this.ui)) {
            await fse.writeFile(gitignorePath, gitignore);
        }
    }
}
