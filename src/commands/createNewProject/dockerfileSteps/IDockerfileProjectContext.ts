/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type ExecuteActivityContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type IProjectWizardContext } from "../IProjectWizardContext";

export interface IDockerfileProjectContext extends IActionContext, ExecuteActivityContext, IProjectWizardContext {
    projectLanguage?: string;
}
