/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { AppSettingsTreeItem } from "vscode-azureappservice";
import { callWithTelemetryAndErrorHandling, IActionContext } from "vscode-azureextensionui";
import { downloadAppSettings } from "../appSettings/downloadAppSettings";

export async function downloadAppSettingsFromApi(node?: AppSettingsTreeItem): Promise<void> {
    return await callWithTelemetryAndErrorHandling('api.downloadAppSettings', async (context: IActionContext) => {
        await downloadAppSettings(context, node);
    });
}
