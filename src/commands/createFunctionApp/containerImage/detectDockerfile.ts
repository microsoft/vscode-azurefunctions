/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { dockerfileGlobPattern } from '../../../constants';
import { getAzureContainerAppsApi } from '../../../getExtensionApi';
import { localize } from '../../../localize';
import { type ICreateFunctionAppContext } from '../../../tree/SubscriptionTreeItem';
import { findFiles, getRootWorkspaceFolder } from '../../../utils/workspace';
import { tryGetFunctionProjectRoot } from '../../createNewProject/verifyIsProject';

export async function detectDockerfile(context: ICreateFunctionAppContext): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
        return;
    }

    context.workspaceFolder ??= await getRootWorkspaceFolder() as vscode.WorkspaceFolder;
    context.rootPath ??= await tryGetFunctionProjectRoot(context, context.workspaceFolder, 'modalPrompt') ?? context.workspaceFolder.uri.fsPath;

    const dockerfiles = (await findFiles(context.rootPath, `**/${dockerfileGlobPattern}`));
    if (dockerfiles.length === 0) {
        return;
    }

    // Todo: If there's multiple dockerfiles, we should probably prompt
    context.dockerfilePath = dockerfiles[0].fsPath;

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

// Todo: Seems like this isn't being used, but could use to filter which dockerfiles to show
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
