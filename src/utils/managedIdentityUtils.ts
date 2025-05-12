/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type NameValuePair } from "@azure/arm-appservice";
import { nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { type IFunctionAppWizardContext } from "../commands/createFunctionApp/IFunctionAppWizardContext";
import { ConnectionKey } from "../constants";

export function createAzureWebJobsStorageManagedIdentitySettings(context: IFunctionAppWizardContext): NameValuePair[] {
    const appSettings: NameValuePair[] = [];
    const storageAccountName = context.newStorageAccountName ?? context.storageAccount?.name;
    if (context.managedIdentity) {
        appSettings.push({
            name: `${ConnectionKey.Storage}__blobServiceUri`,
            value: `https://${storageAccountName}.blob.core.windows.net`
        });
        appSettings.push({
            name: `${ConnectionKey.Storage}__queueServiceUri`,
            value: `https://${storageAccountName}.queue.core.windows.net`
        });
        appSettings.push({
            name: `${ConnectionKey.Storage}__tableServiceUri`,
            value: `https://${storageAccountName}.table.core.windows.net`
        });
        appSettings.push({
            name: `${ConnectionKey.Storage}__clientId`,
            value: nonNullValueAndProp(context.managedIdentity, 'clientId')
        });
        appSettings.push({
            name: `${ConnectionKey.Storage}__credential`,
            value: 'managedidentity'
        });
    }

    return appSettings;
}
