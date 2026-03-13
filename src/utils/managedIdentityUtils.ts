/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type NameValuePair } from "@azure/arm-appservice";
import { nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { type IFunctionAppWizardContext } from "../commands/createFunctionApp/IFunctionAppWizardContext";
import { ConnectionKey } from "../constants";

const defaultStorageEndpointSuffix = 'core.windows.net';

/**
 * Gets the storage endpoint suffix from the Azure environment, stripping any leading dot.
 * Falls back to 'core.windows.net' if the environment doesn't provide one.
 */
function getStorageEndpointSuffix(context: IFunctionAppWizardContext): string {
    let suffix: string = context.environment?.storageEndpointSuffix ?? defaultStorageEndpointSuffix;
    // https://github.com/Azure/azure-sdk-for-node/issues/4706
    if (suffix.startsWith('.')) {
        suffix = suffix.substring(1);
    }
    return suffix;
}

export function createAzureWebJobsStorageManagedIdentitySettings(context: IFunctionAppWizardContext): NameValuePair[] {
    const appSettings: NameValuePair[] = [];
    const storageAccountName = context.newStorageAccountName ?? context.storageAccount?.name;
    if (context.managedIdentity) {
        const endpointSuffix = getStorageEndpointSuffix(context);
        appSettings.push({
            name: `${ConnectionKey.Storage}__blobServiceUri`,
            value: `https://${storageAccountName}.blob.${endpointSuffix}`
        });
        appSettings.push({
            name: `${ConnectionKey.Storage}__queueServiceUri`,
            value: `https://${storageAccountName}.queue.${endpointSuffix}`
        });
        appSettings.push({
            name: `${ConnectionKey.Storage}__tableServiceUri`,
            value: `https://${storageAccountName}.table.${endpointSuffix}`
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
