/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISubscriptionWizardContext } from "vscode-azureextensionui";
import { IFunctionTemplate } from "../../templates/IFunctionTemplate";
import { IProjectWizardContext } from "../createNewProject/IProjectWizardContext";

export interface IFunctionWizardContext extends Partial<ISubscriptionWizardContext>, IProjectWizardContext {
    functionTemplate?: IFunctionTemplate;
    functionName?: string;
}
