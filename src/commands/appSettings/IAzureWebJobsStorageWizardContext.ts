/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, ISubscriptionContext } from "vscode-azureextensionui";

export interface IAzureWebJobsStorageWizardContext extends IActionContext, Partial<ISubscriptionContext> {
    projectPath: string;
    azureWebJobsStorageType?: 'emulator' | 'azure';
}
