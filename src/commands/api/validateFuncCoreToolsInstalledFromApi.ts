/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, IActionContext } from "vscode-azureextensionui";
import { validateFuncCoreToolsInstalled } from "../../funcCoreTools/validateFuncCoreToolsInstalled";

export async function validateFuncCoreToolsInstalledFromApi(message: string, workspacePath: string): Promise<boolean | undefined> {
    return await callWithTelemetryAndErrorHandling('api.validateFuncCoreToolsInstalled', async (context: IActionContext) => {
        return await validateFuncCoreToolsInstalled(context, message, workspacePath);
    });
}
