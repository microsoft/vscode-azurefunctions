/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { dockerfileGlobPattern, hostFileName } from '../../../constants';
import { getAzureContainerAppsApi } from '../../../getExtensionApi';
import { localize } from '../../../localize';
import { type ICreateFunctionAppContext } from '../../../tree/SubscriptionTreeItem';
import { findFiles } from '../../../utils/workspace';
import { isFunctionProject } from '../../createNewProject/verifyIsProject';

export async function detectDockerfile(context: ICreateFunctionAppContext): Promise<void> {
    // don't overwrite the workspace folder on the context if it's already set
    if (vscode.workspace.workspaceFolders && !context.workspaceFolder) {
        context.workspaceFolder = vscode.workspace.workspaceFolders[0];
        const workspacePath = context.workspaceFolder.uri.fsPath;
        let dockerfilePath: string = workspacePath
        context.rootPath = workspacePath;

        //check for dockerfile location
        if (await isFunctionProject(workspacePath)) {
            const files = (await findFiles(context.workspaceFolder, `**/${dockerfileGlobPattern}`));
            if (files.length === 0) {
                return;
            }
            dockerfilePath = path.dirname(files[0].fsPath);
        }

        // check if host.json is in the same directory as the Dockerfile
        if ((await findFiles(dockerfilePath, hostFileName)).length > 0) {
            context.dockerfilePath = (await findFiles(dockerfilePath, dockerfileGlobPattern))[0].fsPath;
        } else {
            context.dockerfilePath = undefined;
        }

        // prompt user to proceed with containerized function app creation
        if (context.dockerfilePath) {
            const placeHolder: string = localize('detectedDockerfile', 'Dockerfile detected. What would you like to deploy?');
            const containerImageButton: vscode.MessageItem = { title: localize('containerImage', 'Container Image') };
            const codeButton: vscode.MessageItem = { title: localize('code', 'Code') };
            const buttons: vscode.MessageItem[] = [containerImageButton, codeButton];
            const result: vscode.MessageItem = await context.ui.showWarningMessage(placeHolder, { modal: true }, ...buttons);

            // if yes, ensure container apps extension is installed before proceeding
            if (result === containerImageButton) {
                await getAzureContainerAppsApi(context);
            } else if (result === codeButton) {
                context.dockerfilePath = undefined;
            }
        }
    }
}

export async function detectFunctionsDockerfile(file: string): Promise<boolean> {
    const content = await AzExtFsExtra.readFile(file);
    const lines: string[] = content.split('\n');

    for (const line of lines) {
        if (line.includes('mcr.microsoft.com/azure-functions')) {
            return true;
        }
    }
    return false
}
