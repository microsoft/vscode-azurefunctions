/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, UserCancelledError } from "@microsoft/vscode-azext-utils";
import { AzureExtensionApiProvider } from "@microsoft/vscode-azext-utils/api";
import { commands, Extension, extensions } from "vscode";
import { localize } from "./localize";
import { AzureFunctionsExtensionApi } from "./vscode-azurefunctions.api";

/**
 * @param installMessage Override default message shown if extension is not installed.
 */
export async function getFunctionsApi(context: IActionContext, installMessage?: string): Promise<AzureFunctionsExtensionApi> {
    const funcExtensionId: string = 'ms-azuretools.vscode-azurefunctions';
    const funcExtension: AzureExtensionApiProvider | undefined = await getApiExport(funcExtensionId);

    if (funcExtension) {
        return funcExtension.getApi<AzureFunctionsExtensionApi>('^1.7.0');
    }

    await context.ui.showWarningMessage(installMessage ?? localize('funcInstall', 'You must have the "Azure Functions" extension installed to perform this operation.'), { title: 'Install', stepName: 'installFunctions' });
    const commandToRun: string = 'extension.open';
    void commands.executeCommand(commandToRun, funcExtensionId);

    // we still need to throw an error even if the user installs
    throw new UserCancelledError('postInstallFunctions');
}
export async function getApiExport<T>(extensionId: string): Promise<T | undefined> {
    const extension: Extension<T> | undefined = extensions.getExtension(extensionId);
    if (extension) {
        if (!extension.isActive) {
            await extension.activate();
        }

        return extension.exports;
    }

    return undefined;
}
