/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { OutputChannel } from "vscode";
import { callWithTelemetryAndErrorHandling, IActionContext } from "vscode-azureextensionui";
import { ISimpleAppSettingsClient, uploadAppSettingsInternal } from "../appSettings/uploadAppSettings";

export async function uploadAppSettingsFromApi(client: ISimpleAppSettingsClient, outputChannel: OutputChannel, workspacePath?: string): Promise<void> {
    return await callWithTelemetryAndErrorHandling('api.uploadAppSettings', async (context: IActionContext) => {
        await uploadAppSettingsInternal(context, client, outputChannel, workspacePath);
    });
}
