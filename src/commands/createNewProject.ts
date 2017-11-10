/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';
import { IUserInterface } from '../IUserInterface';
import { localize } from '../localize';
import { confirmOverwriteFile } from '../utils/fs';
import * as fsUtil from '../utils/fs';
import { gitUtils } from '../utils/gitUtils';
import * as workspaceUtil from '../utils/workspace';
import { VSCodeUI } from '../VSCodeUI';

const taskId: string = 'launchFunctionApp';
const tasksJson: {} = {
    version: '2.0.0',
    tasks: [
        {
            label: localize('azFunc.launchFuncApp', 'Launch Function App'),
            identifier: taskId,
            type: 'shell',
            command: 'func host start',
            isBackground: true,
            presentation: {
                reveal: 'always'
            },
            problemMatcher: [
                {
                    owner: 'azureFunctions',
                    pattern: [
                        {
                            regexp: '\\b\\B',
                            file: 1,
                            location: 2,
                            message: 3
                        }
                    ],
                    background: {
                        activeOnStart: true,
                        beginsPattern: '^.*Stopping host.*',
                        endsPattern: '^.*Job host started.*'
                    }
                }
            ]
        }
    ]
};

const launchJson: {} = {
    version: '0.2.0',
    configurations: [
        {
            name: localize('azFunc.attachToFunc', 'Attach to Azure Functions'),
            type: 'node',
            request: 'attach',
            port: 5858,
            protocol: 'inspector',
            preLaunchTask: taskId
        }
    ]
};

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

const hostJson: {} = {};

const localSettingsJson: {} = {
    IsEncrypted: false,
    Values: {
        AzureWebJobsStorage: ''
    }
};

export async function createNewProject(outputChannel: OutputChannel, functionAppPath?: string, openFolder: boolean = true, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    if (functionAppPath === undefined) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder that will contain your function app'));
    }

    const vscodePath: string = path.join(functionAppPath, '.vscode');
    await fse.ensureDir(vscodePath);

    if (await gitUtils.isGitInstalled(functionAppPath)) {
        await gitUtils.gitInit(outputChannel, functionAppPath);

        const gitignorePath: string = path.join(functionAppPath, '.gitignore');
        if (await confirmOverwriteFile(gitignorePath)) {
            await fse.writeFile(gitignorePath, gitignore);
        }
    }

    const tasksJsonPath: string = path.join(vscodePath, 'tasks.json');
    if (await confirmOverwriteFile(tasksJsonPath)) {
        await fsUtil.writeFormattedJson(tasksJsonPath, tasksJson);
    }

    const launchJsonPath: string = path.join(vscodePath, 'launch.json');
    if (await confirmOverwriteFile(launchJsonPath)) {
        await fsUtil.writeFormattedJson(launchJsonPath, launchJson);
    }

    const hostJsonPath: string = path.join(functionAppPath, 'host.json');
    if (await confirmOverwriteFile(hostJsonPath)) {
        await fsUtil.writeFormattedJson(hostJsonPath, hostJson);
    }

    const localSettingsJsonPath: string = path.join(functionAppPath, 'local.settings.json');
    if (await confirmOverwriteFile(localSettingsJsonPath)) {
        await fsUtil.writeFormattedJson(localSettingsJsonPath, localSettingsJson);
    }

    if (openFolder && !workspaceUtil.isFolderOpenInWorkspace(functionAppPath)) {
        // If the selected folder is not open in a workspace, open it now. NOTE: This may restart the extension host
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(functionAppPath), false);
    }
}
