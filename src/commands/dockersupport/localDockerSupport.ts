/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext } from "vscode-azureextensionui";
import { localize } from '../../localize';
import { SlotTreeItemBase } from "../../tree/SlotTreeItemBase";
import { openUrl } from '../../utils/openUrl';
import { requestUtils } from "../../utils/requestUtils";
import { prompt } from "./askDockerStep";
import { validateDockerInstalled } from './validateDockerInstalled';

export const DOCKER_PROMPT_YES = "yes";

/**
 * Main Function Called to initialize the Docker flow with cloning Function App project locally from VS Code Extension
 * @param context - behavior of action
 * @param devContainerFolderPathUri - URI for dev container
 * @param devContainerName - string name of dev container
 * @param node - Function App Project
 */
export async function localDockerPrompt(context: IActionContext, devContainerFolderPathUri: vscode.Uri, node?: SlotTreeItemBase, devContainerName?: string): Promise<boolean> {
    if (node && devContainerName && node.site.isLinux) {
        if (await prompt(context) === DOCKER_PROMPT_YES) {
            await downloadLocalDevFiles(context, devContainerFolderPathUri, devContainerName);
            if (!(await validateDockerInstalled())) {
                const dockerDocumentation: string = localize('documentation', 'Docker Documentation');
                await vscode.window.showInformationMessage(localize('download', 'We noticed you don\'t have Docker installed. Check the Docker Documentation to download Docker to your system.'), dockerDocumentation,).then(async result => {
                    if (result === dockerDocumentation) {
                        await openUrl('https://docs.docker.com/get-docker/');
                    }
                });
                return false;
            }
            return true;
        } else {
            void vscode.window.showInformationMessage(localize('noDocker', 'Continuing without the use of Docker as user requested'));
            return false;
        }
    } else {
        void vscode.window.showInformationMessage(localize('unableDocker', 'Initializing project without the use of Docker'));
        return false;
    }
}

export async function downloadLocalDevFiles(context: IActionContext, devContainerFolderPathUri: vscode.Uri, devContainerName?: string): Promise<void> {
    const downloadDevContainerJson = requestUtils.downloadFile(context, `https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/devcontainer.json`, vscode.Uri.joinPath(devContainerFolderPathUri, 'devcontainer.json').fsPath);
    const downloadDevContainerDockerfile = requestUtils.downloadFile(context, `https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/Dockerfile`, vscode.Uri.joinPath(devContainerFolderPathUri, 'Dockerfile').fsPath);

    await Promise.all([
        downloadDevContainerJson,
        downloadDevContainerDockerfile
    ]);
}
