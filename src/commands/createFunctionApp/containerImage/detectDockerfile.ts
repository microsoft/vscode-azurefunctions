/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { AzExtFsExtra, nonNullProp, type IActionContext, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { RelativePattern, workspace, type MessageItem, type Uri, type WorkspaceFolder } from 'vscode';
import { browseItem, dockerfileGlobPattern } from '../../../constants';
import { getAzureContainerAppsApi } from '../../../getExtensionApi';
import { localize } from '../../../localize';
import { type ICreateFunctionAppContext } from '../../../tree/SubscriptionTreeItem';
import { getRootWorkspaceFolder } from '../../../utils/workspace';
import { tryGetFunctionProjectRoot } from '../../createNewProject/verifyIsProject';

export async function detectDockerfile(context: ICreateFunctionAppContext): Promise<string | undefined> {
    if (!workspace.workspaceFolders?.length) {
        return undefined;
    }

    context.workspaceFolder ??= await getRootWorkspaceFolder() as WorkspaceFolder;
    context.rootPath ??= await tryGetFunctionProjectRoot(context, context.workspaceFolder, 'prompt') ?? context.workspaceFolder.uri.fsPath;

    const pattern: RelativePattern = new RelativePattern(context.rootPath, `**/${dockerfileGlobPattern}`);
    const dockerfiles: Uri[] = await workspace.findFiles(pattern);
    context.telemetry.properties.dockerfileCount = String(dockerfiles.length);

    if (dockerfiles.length === 0) {
        context.telemetry.properties.containerizedDockerfileCount = '0';
        return undefined;
    }

    const useContainerImage: boolean = await promptUseContainerImage(context);
    context.telemetry.properties.useContainerImage = String(useContainerImage);

    if (!useContainerImage) {
        return undefined;
    }

    // ensure container apps extension is installed before proceeding
    await getAzureContainerAppsApi(context);

    if (dockerfiles.length === 1) {
        const dockerfilePath: string = dockerfiles[0].fsPath;
        context.telemetry.properties.containerizedDockerfileCount = await detectFunctionsDockerfile(dockerfilePath) ? '1' : '0';
        return dockerfilePath;
    } else {
        return await promptChooseDockerfile(context, dockerfiles);
    }
}

async function promptUseContainerImage(context: IActionContext): Promise<boolean> {
    const placeHolder: string = localize('detectedDockerfile', 'Dockerfile detected. What would you like to deploy?');
    const containerImageButton: MessageItem = { title: localize('containerImage', 'Container Image') };
    const codeButton: MessageItem = { title: localize('code', 'Code') };
    const buttons: MessageItem[] = [containerImageButton, codeButton];
    const result: MessageItem = await context.ui.showWarningMessage(placeHolder, { modal: true }, ...buttons);
    return result === containerImageButton;
}

async function promptChooseDockerfile(context: ICreateFunctionAppContext, dockerfiles: Uri[]): Promise<string> {
    const checkContainerizedDockerfiles: Promise<boolean>[] = dockerfiles.map(d => detectFunctionsDockerfile(d.fsPath));

    let containerizedDockerfileCount: number = 0;
    const picks: IAzureQuickPickItem<string | undefined>[] = [];

    for (const [i, dockerfile] of dockerfiles.entries()) {
        const isContainerizedDockerfile: boolean = await checkContainerizedDockerfiles[i];
        if (isContainerizedDockerfile) {
            containerizedDockerfileCount++;
        }

        const relativeDirectory: string = '.' + path.sep + path.relative(nonNullProp(context, 'rootPath'), dockerfile.fsPath);
        const functionsImage: string = localize('functionsImage', 'Functions Image');

        picks.push({
            label: path.basename(dockerfile.fsPath),
            description: isContainerizedDockerfile ? `${relativeDirectory} (${functionsImage})` : relativeDirectory,
            data: dockerfile.fsPath,
        });
    }
    context.telemetry.properties.containerizedDockerfileCount = String(containerizedDockerfileCount);

    picks.push(browseItem);

    const dockerfilePath: string | undefined = (await context.ui.showQuickPick(picks, {
        placeHolder: localize('dockerfilePick', 'Choose a Dockerfile from your current workspace.'),
        suppressPersistence: true,
    })).data;

    return dockerfilePath || (await context.ui.showOpenDialog({ filters: {} }))[0].fsPath;
}

async function detectFunctionsDockerfile(dockerfilePath: string): Promise<boolean> {
    try {
        const content = await AzExtFsExtra.readFile(dockerfilePath);
        return content.includes('mcr.microsoft.com/azure-functions');
    } catch {
        return false;
    }
}
