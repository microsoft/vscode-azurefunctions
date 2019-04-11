/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, workspace, WorkspaceFolder } from "vscode";
import { AzureParentTreeItem } from "vscode-azureextensionui";
import { tryGetFunctionProjectRoot } from "../../commands/createNewProject/verifyIsProject";
import { getFuncExtensionSetting } from "../../ProjectSettings";
import { LocalProjectTreeItem } from "./LocalProjectTreeItem";

/**
 * This has some known limitations that will need to be addressed before removing the feature flag
 * See https://github.com/Microsoft/vscode-azurefunctions/issues/1163
 */
export async function getProjectTreeItems(context: ExtensionContext): Promise<AzureParentTreeItem[]> {
    const result: AzureParentTreeItem[] = [];
    if (getFuncExtensionSetting('enableProjectTree')) {
        // tslint:disable-next-line: strict-boolean-expressions
        const folders: WorkspaceFolder[] = workspace.workspaceFolders || [];
        for (const folder of folders) {
            const projectPath: string | undefined = await tryGetFunctionProjectRoot(folder.uri.fsPath, true /* suppressPrompt */);
            if (projectPath) {
                const treeItem: LocalProjectTreeItem = new LocalProjectTreeItem(projectPath, folder.uri.fsPath);
                context.subscriptions.push(treeItem);
                // tslint:disable-next-line: no-any
                result.push(treeItem);
            }
        }
    }

    return result;
}
