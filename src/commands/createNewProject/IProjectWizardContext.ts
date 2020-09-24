/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceFolder } from "vscode";
import { IActionContext } from "vscode-azureextensionui";
import { ProjectLanguage } from "../../constants";
import { FuncVersion } from "../../FuncVersion";

export interface IProjectWizardContext extends IActionContext {
    projectPath: string;
    workspacePath: string;
    workspaceFolder: WorkspaceFolder | undefined;

    language?: ProjectLanguage;
    languageFilter?: RegExp;
    version: FuncVersion;
    openBehavior?: OpenBehavior;
    generateFromOpenAPI?: boolean;
}

export type OpenBehavior = 'AddToWorkspace' | 'OpenInNewWindow' | 'OpenInCurrentWindow' | 'AlreadyOpen' | 'DontOpen';
