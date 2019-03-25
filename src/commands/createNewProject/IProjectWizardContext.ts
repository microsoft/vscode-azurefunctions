/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from "vscode-azureextensionui";
import { ProjectLanguage, ProjectRuntime } from "../../constants";

export interface IProjectWizardContext {
    actionContext: IActionContext;
    projectPath: string;
    workspacePath: string;

    language?: ProjectLanguage;
    runtime?: ProjectRuntime;
    openBehavior?: OpenBehavior;
}

export type OpenBehavior = 'AddToWorkspace' | 'OpenInNewWindow' | 'OpenInCurrentWindow' | 'AlreadyOpen' | 'DontOpen';
