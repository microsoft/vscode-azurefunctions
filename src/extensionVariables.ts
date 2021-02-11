/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, TreeView } from "vscode";
import { AzExtTreeDataProvider, AzExtTreeItem, IAzExtOutputChannel, IAzureUserInput } from "vscode-azureextensionui";
import { func } from "./constants";
import { CentralTemplateProvider } from "./templates/CentralTemplateProvider";
import { AzureAccountTreeItemWithProjects } from "./tree/AzureAccountTreeItemWithProjects";

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let tree: AzExtTreeDataProvider;
    export let treeView: TreeView<AzExtTreeItem>;
    export let azureAccountTreeItem: AzureAccountTreeItemWithProjects;
    export let outputChannel: IAzExtOutputChannel;
    export let ui: IAzureUserInput;
    export let templateProvider: CentralTemplateProvider;
    export let ignoreBundle: boolean | undefined;
    export const funcCliPath: string = func;
    export const prefix: string = 'azureFunctions';
}

export enum TemplateSource {
    Backup = 'Backup',
    Latest = 'Latest',
    Staging = 'Staging'
}
