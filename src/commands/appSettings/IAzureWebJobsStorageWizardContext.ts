/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageAccount } from "@azure/arm-storage";
import { IActionContext, ISubscriptionContext } from "@microsoft/vscode-azext-utils";

export interface IAzureWebJobsStorageWizardContext extends IActionContext, Partial<ISubscriptionContext> {
    projectPath: string;
    storageAccount?: StorageAccount;
    newStorageAccountName?: string;
    azureWebJobsStorageType?: 'emulator' | 'azure';
}
