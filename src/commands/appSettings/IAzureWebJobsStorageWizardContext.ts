/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IStorageAccountWizardContext } from "vscode-azureextensionui";

export interface IAzureWebJobsStorageWizardContext extends Partial<IStorageAccountWizardContext> {
    projectPath: string;
    actionContext: IActionContext;
    azureWebJobsStorageType?: 'emulator' | 'azure';
}
