import * as vscode from 'vscode';
import { IActionContext } from "vscode-azureextensionui";
import { localize } from '../../localize';
import { SlotTreeItemBase } from "../../tree/SlotTreeItemBase";
import { requestUtils } from "../../utils/requestUtils";
import { prompt, prompt2 } from "./askDockerStep";
import { validateDockerInstalled } from "./validateDockerInstalled";

/**
 * Main Function Called to initialize the Docker flow with cloning Function App project locally from VS Code Extension
 * @param context - behavour of action
 * @param devContainerFolderPathUri - URI for dev container
 * @param language - language of Function App project
 * @param node - Function App Project
 * @param devContainerName - string name of dev container
 */
export async function localDockerPrompt(context: IActionContext, devContainerFolderPathUri: vscode.Uri, language: string, node?: SlotTreeItemBase, devContainerName?: string): Promise<void> {
    if (node) {
        // external - checks if the project runtime is node or python
        if (language == "node" || language == "python") { // getFunctionsWorkerRuntime()
            // check if the function app is in Linux
            if (node.site.reserved) {
                // asks if the user wants to use Docker for initializing the project locally
                const useDocker: string = await prompt(context);
                if (useDocker === "yes") {
                    // we will always want to download dev container and DockerFile
                    // download dev container - running container locally
                    await requestUtils.downloadFile(
                        `https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/devcontainer.json`,
                        vscode.Uri.joinPath(devContainerFolderPathUri, 'devcontainer.json').fsPath
                    );
                    // download docker file
                    await requestUtils.downloadFile(
                        `https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/${devContainerName}/.devcontainer/Dockerfile`,
                        vscode.Uri.joinPath(devContainerFolderPathUri, 'Dockerfile').fsPath
                    );
                    // external - check if Docker is installed, Remote Development extension AND Docker Extension
                    if (!validateDockerInstalled()) {
                        // if Docker is not downloaded - ask the user if they'd like to download Docker
                        const downloadDocker: string = await prompt2(context);
                        if (downloadDocker === "yes") {
                            // Check if Operating System is Windows
                            if (process.platform == "win32") {
                                // Download Docker with an MSI package, Reid has this package
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
                void vscode.window.showInformationMessage(localize('projectError', 'Function App is not Linux. Continuing without the use of Docker'));
            }
        } else {
            void vscode.window.showInformationMessage(localize('runtimeError', 'Runtime is not Node or Python. Continuing without the use of Docker'));
        }
    } else {
        void vscode.window.showInformationMessage(localize('noNode', 'Node is undefined. Continuing without the use of Docker'));
    }

}
