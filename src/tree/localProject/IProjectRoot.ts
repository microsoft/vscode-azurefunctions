/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceFolder } from "vscode";
import { ISubscriptionRoot } from "vscode-azureextensionui";

export interface IProjectRoot extends ISubscriptionRoot {
    projectPath: string;
    workspacePath: string;
    workspaceFolder: WorkspaceFolder;
}
