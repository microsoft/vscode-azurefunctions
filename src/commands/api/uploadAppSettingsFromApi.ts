/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { callWithTelemetryAndErrorHandling, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type IAppSettingsClient } from "../../vscode-azurefunctions.api";
import { uploadAppSettingsInternal } from "../appSettings/uploadAppSettings";

export async function uploadAppSettingsFromApi(client: IAppSettingsClient, exclude?: (RegExp | string)[]): Promise<void> {
    return await callWithTelemetryAndErrorHandling('api.uploadAppSettings', async (context: IActionContext) => {
        await uploadAppSettingsInternal(context, client, undefined, exclude);
    });
}
