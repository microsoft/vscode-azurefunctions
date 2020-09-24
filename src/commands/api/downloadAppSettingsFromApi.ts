/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { callWithTelemetryAndErrorHandling, IActionContext } from "vscode-azureextensionui";
import { ISimpleAppSettingsClient } from "../../vscode-azurefunctions.api";
import { downloadAppSettingsInternal } from "../appSettings/downloadAppSettings";

export async function downloadAppSettingsFromApi(client: ISimpleAppSettingsClient): Promise<void> {
    return await callWithTelemetryAndErrorHandling('api.downloadAppSettings', async (context: IActionContext) => {
        await downloadAppSettingsInternal(context, client);
    });
}
