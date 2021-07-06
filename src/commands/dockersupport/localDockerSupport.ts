import * as vscode from 'vscode';
import { IActionContext } from "vscode-azureextensionui";
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
                        // if Docker is not downloaded
                        const downloadDocker: string = await prompt2(context);
                        if (downloadDocker === "yes") {
                            // Check if Operating System is Windows
                            if (process.platform == "win32") {
                                // Download Docker with an MSI package, Elliott mentioned them having to click a link
                            } else {
                                // Not windows: display link to download docker externally from Docker documentation
                            }
                        } else {
                            // just open up project but docker files are already downloaded
                        }
                    }
                } else {
                    //throw new Error(localize('noDocker', 'User does NOT want to use Docker')); // change to a pop up notification
                }
                // RETURNS back
            } else {
                //throw new Error(localize('noDocker', 'User does NOT want to use Docker')); // change to a pop up notification
            }
            //} else {
            //    throw new Error(localize('projectError', 'Function App is not Linux')); // change to a pop up notification
            //}
        } else {
            //throw new Error(localize('runtimeError', 'Runtime is not Node or Python')); // change to a pop up notification
        }
    } else {
        //throw new Error(localize('noNode', 'Node is undefined'));
    }

}
