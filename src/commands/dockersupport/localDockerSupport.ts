import * as vscode from 'vscode';
import { IActionContext } from "vscode-azureextensionui";
import { localize } from '../../localize';
import { SlotTreeItemBase } from "../../tree/SlotTreeItemBase";
import { requestUtils } from "../../utils/requestUtils";
import { prompt, prompt2 } from "./askDockerStep";
import { validateDockerInstalled } from "./validateDockerInstalled";

export const DOCKER_PROMPT_YES = "yes";
export const PLATFORM_WIN32 = "win32";

/**
 * Main Function Called to initialize the Docker flow with cloning Function App project locally from VS Code Extension
 * @param context - behavour of action
 * @param devContainerFolderPathUri - URI for dev container
 * @param devContainerName - string name of dev container
 * @param node - Function App Project
 */
export async function localDockerPrompt(context: IActionContext, devContainerFolderPathUri: vscode.Uri, node?: SlotTreeItemBase, devContainerName?: string): Promise<void> {
    if (node && devContainerName && node.site.reserved) {
        // asks if the user wants to use Docker for initializing the project locally
        if (await prompt(context) === DOCKER_PROMPT_YES) {
            await downloadLocalDevFiles(devContainerFolderPathUri, devContainerName);
            // external - check if Docker is installed, Remote Development extension AND Docker Extension
            if (!validateDockerInstalled()) {
                // if Docker is not downloaded - ask the user if they'd like to download Docker
                if (await prompt2(context) === DOCKER_PROMPT_YES) {
                    // Check if Operating System is Windows
                    if (process.platform.toLowerCase() === PLATFORM_WIN32) {
                        // Download Docker with an MSI package
                    } else {
                        // Not windows: display link to download docker externally from Docker documentation
                        void vscode.window.showInformationMessage(localize('downloadDocker', 'Check the (Docker documentation)[https://docs.docker.com/get-docker/] to download Docker for your system'));
                    }
                } else {
                    void vscode.window.showInformationMessage(localize('noDocker', 'Continuing without the use of Docker as user requested'));
                }
            }
        } else {
            void vscode.window.showInformationMessage(localize('noDocker', 'Continuing without the use of Docker as user requested'));
        }
    } else {
        void vscode.window.showInformationMessage(localize('unableDocker', 'Initializing project without the use of Docker'));
    }
}

export async function downloadLocalDevFiles(devContainerFolderPathUri: vscode.Uri, devContainerName?: string): Promise<void> {
    const downloadDevContainerJson = requestUtils.downloadFile(`https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/devcontainer.json`, vscode.Uri.joinPath(devContainerFolderPathUri, 'devcontainer.json').fsPath);
    const downloadDevContainerDockerfile = requestUtils.downloadFile(`https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/Dockerfile`, vscode.Uri.joinPath(devContainerFolderPathUri, 'Dockerfile').fsPath);

    await Promise.all([
        downloadDevContainerJson,
        downloadDevContainerDockerfile
    ]);
}
