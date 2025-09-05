/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { dockerfileGlobPattern } from '../../../constants';
import { getAzureContainerAppsApi } from '../../../getExtensionApi';
import { localize } from '../../../localize';
import { type ICreateFunctionAppContext } from '../../../tree/SubscriptionTreeItem';
import { findFiles, getRootWorkspaceFolder } from '../../../utils/workspace';
import { tryGetFunctionProjectRoot } from '../../createNewProject/verifyIsProject';

export async function detectAndConfigureContainerizedProject(context: ICreateFunctionAppContext): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
        return;
    }

    context.workspaceFolder ??= await getRootWorkspaceFolder() as vscode.WorkspaceFolder;
    context.rootPath ??= await tryGetFunctionProjectRoot(context, context.workspaceFolder, 'modalPrompt') ?? context.workspaceFolder.uri.fsPath;

    const dockerfiles = (await findFiles(context.rootPath, `**/${dockerfileGlobPattern}`));
    if (dockerfiles.length === 0) {
        return;
    }

    const useContainerImage: boolean = await askUseContainerImage(context);
    if (!useContainerImage) {
        return;
    }

    // Todo: If there's multiple dockerfiles, we should probably prompt
    context.dockerfilePath = dockerfiles[0].fsPath;

    // ensure container apps extension is installed before proceeding
    await getAzureContainerAppsApi(context);
}

async function askUseContainerImage(context: IActionContext): Promise<boolean> {
    const placeHolder: string = localize('detectedDockerfile', 'Dockerfile detected. What would you like to deploy?');
    const containerImageButton: vscode.MessageItem = { title: localize('containerImage', 'Container Image') };
    const codeButton: vscode.MessageItem = { title: localize('code', 'Code') };
    const buttons: vscode.MessageItem[] = [containerImageButton, codeButton];
    const result: vscode.MessageItem = await context.ui.showWarningMessage(placeHolder, { modal: true }, ...buttons);
    return result === containerImageButton;
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
