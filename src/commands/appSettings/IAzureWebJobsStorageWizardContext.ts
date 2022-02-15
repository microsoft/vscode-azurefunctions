/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, ISubscriptionContext } from "@microsoft/vscode-azext-utils";

export interface IAzureWebJobsStorageWizardContext extends IActionContext, Partial<ISubscriptionContext> {
    projectPath: string;
    azureWebJobsStorageType?: 'emulator' | 'azure';
}
