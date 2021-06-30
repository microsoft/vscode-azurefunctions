import * as vscode from 'vscode';
import { IActionContext } from "vscode-azureextensionui";
import { localize } from "../../localize";
import { SlotTreeItemBase } from "../../tree/SlotTreeItemBase";
import { requestUtils } from "../../utils/requestUtils";
import { getFunctionsWorkerRuntime } from "../../vsCodeConfig/settings";
import { prompt } from "./askDockerStep";
import { validateDockerInstalled } from "./validateDockerInstalled";

/**
 * Main Function Called to initialize the Docker flow with cloning Function App project locally from VS Code Extension
 * @param context - Provides basic actions for functions
 * @param node - the Function App project that will clone locally inserted as a SlotTreeItem
 * @param language - Language of the Function App Project
 */
export async function localDockerPrompt(context: IActionContext, devContainerFolderPathUri: vscode.Uri, language: string, node?: SlotTreeItemBase, devContainerName?: string): Promise<void> {

    // external - checks if the project runtime is node or python
    if (node) {
        if (getFunctionsWorkerRuntime(language) == "node" || getFunctionsWorkerRuntime(language) == "python") {
            // check if the function app is in Linux
            if (node.root.client.isLinux) {
                // asks if the user wants to use Docker for initializing the project locally
                const result: string = await prompt(context);
                if (result === "yes") {
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
                    if (validateDockerInstalled()) {
                        // don't need to do anything more here

                    } else {
                        // Check if Operating System is Windows
                        if (process.platform == "win32") {
                            //Download Docker with an MSI
                        } else {
                            // display link to download docker
                        }
                    }
                } else {
                    //throw new Error(localize('noDocker', 'User does NOT want to use Docker')); // change to a pop up notification
                }
            } else {
                throw new Error(localize('projectError', 'Function App is not Linux')); // change to a pop up notification
            }
        } else {
            throw new Error(localize('runtimeError', 'Runtime is not Node or Python')); // change to a pop up notification
        }
    } else {
        throw new Error(localize('noNode', 'Node is undefined'));
    }

}
