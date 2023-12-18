/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { dockerfileGlobPattern, hostFileName } from '../../../constants';
import { type ICreateFunctionAppContext } from '../../../tree/SubscriptionTreeItem';
import { findFiles } from '../../../utils/workspace';
import { isFunctionProject } from '../../createNewProject/verifyIsProject';
import path = require('path');

export async function detectDockerfile(context: ICreateFunctionAppContext): Promise<void> {
    //get workspace folder
    if (vscode.workspace.workspaceFolders) {
        context.workspaceFolder = vscode.workspace.workspaceFolders[0];
        let hostPath: string = context.workspaceFolder.uri.fsPath;

        //first check the root folder for the host.json if not found check the subfolders
        if (await isFunctionProject(context.workspaceFolder.uri.fsPath)) {
            context.rootPath = context.workspaceFolder.uri.fsPath;
        } else {
            context.rootPath = context.workspaceFolder.uri.fsPath;
            const files = (await findFiles(context.workspaceFolder, `*/${hostFileName}`));
            hostPath = path.dirname(files[0].fsPath);
        }

        //check if dockerfile exists
        context.dockerfilePath = (await findFiles(hostPath, dockerfileGlobPattern))[0].fsPath;
        //need to add detect functions dockerfile
    }
}

export async function detectFunctionsDockerfile(file: string): Promise<boolean> {
    const content = await AzExtFsExtra.readFile(file);
    const lines: string[] = content.split('\n');

    for (const line of lines) {
        if (line.includes('mcr.microsoft.com/azure-functions')) {
            console.log('Found dockerfile');
            return true;
        }
    }
    return false
}
