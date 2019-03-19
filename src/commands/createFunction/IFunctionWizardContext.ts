/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, ISubscriptionWizardContext } from "vscode-azureextensionui";
import { ProjectLanguage, ProjectRuntime } from "../../constants";
import { IFunctionTemplate } from "../../templates/IFunctionTemplate";

export interface IFunctionWizardContext extends Partial<ISubscriptionWizardContext> {
    functionAppPath: string;
    runtime: ProjectRuntime;
    language: ProjectLanguage;
    actionContext: IActionContext;
    template: IFunctionTemplate;

    functionName?: string;
    newFilePath?: string;
}
