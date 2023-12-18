/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ExecuteActivityContext, IActionContext } from "@microsoft/vscode-azext-utils";
import { WorkspaceFolder } from "vscode";

export interface IDockerfileProjectContext extends IActionContext, ExecuteActivityContext {
    projectPath?: string;
    workspacePath?: string;
    workspaceFolder?: WorkspaceFolder | undefined;
    dockerfileLanguage?: string;
}
