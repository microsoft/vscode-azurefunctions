/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { StorageAccount } from "@azure/arm-storage";
import { IActionContext, ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { StorageConnectionTypeValues } from "../../../../constants";

export interface IAzureWebJobsStorageWizardContext extends IActionContext, Partial<ISubscriptionContext> {
    projectPath: string;

    storageAccount?: StorageAccount;
    newStorageAccountName?: string;

    azureWebJobsStorageType?: StorageConnectionTypeValues;
    azureWebJobsRemoteConnection?: string;
}
