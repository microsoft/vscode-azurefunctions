/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { AppSettingsTreeItem } from "vscode-azureappservice";
import { callWithTelemetryAndErrorHandling, IActionContext } from "vscode-azureextensionui";
import { uploadAppSettings } from "../appSettings/uploadAppSettings";

export async function uploadAppSettingsFromApi(node?: AppSettingsTreeItem): Promise<void> {
    return await callWithTelemetryAndErrorHandling('api.uploadAppSettings', async (context: IActionContext) => {
        await uploadAppSettings(context, node);
    });
}
