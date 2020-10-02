/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { callWithTelemetryAndErrorHandling, IActionContext } from "vscode-azureextensionui";
import { IAppSettingsClient } from "../../vscode-azurefunctions.api";
import { uploadAppSettingsInternal } from "../appSettings/uploadAppSettings";

export async function uploadAppSettingsFromApi(client: IAppSettingsClient): Promise<void> {
    return await callWithTelemetryAndErrorHandling('api.uploadAppSettings', async (context: IActionContext) => {
        await uploadAppSettingsInternal(context, client);
    });
}
