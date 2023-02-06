/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext, nonNullValue, openUrl } from "@microsoft/vscode-azext-utils";
import { MessageItem } from "vscode";
import { FuncVersion, funcVersionLink, tryParseFuncVersion } from "../../FuncVersion";
import { tryGetLocalFuncVersion } from "../../funcCoreTools/tryGetLocalFuncVersion";
import { localize } from "../../localize";
import { getWorkspaceSetting, updateGlobalSetting } from "../../vsCodeConfig/settings";

export async function showCoreToolsWarning(context: IActionContext, runtimeVersion: FuncVersion, siteName: string): Promise<void> {
    const showCoreToolsWarningKey: string = 'showCoreToolsWarning';
    if (getWorkspaceSetting<boolean>(showCoreToolsWarningKey)) {
        const coreToolsVersion = await tryGetLocalFuncVersion(context, undefined);
        if (coreToolsVersion) {
            const localVersion = nonNullValue(tryParseFuncVersion(coreToolsVersion), 'localCoreToolsVersion');

            if (localVersion === FuncVersion.v2 || localVersion === FuncVersion.v3) {
                await showCoreToolsEOLWarning(context, localVersion);
            } else if (localVersion !== runtimeVersion) {
                await showCoreToolsMismatchWarning(context, localVersion, runtimeVersion, siteName);
            }
        }
    }
}

async function showCoreToolsWarningHelper(context: IActionContext, message: string): Promise<MessageItem> {
    const showCoreToolsWarningKey: string = 'showCoreToolsWarning';
    let result: MessageItem;
    do {
        result = await context.ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
        if (result === DialogResponses.learnMore) {
            await openUrl(funcVersionLink);
        } else if (result === DialogResponses.dontWarnAgain) {
            await updateGlobalSetting(showCoreToolsWarningKey, false);
        }
    }
    while (result === DialogResponses.learnMore);
    return result;
}
async function showCoreToolsEOLWarning(context: IActionContext, localVersion: FuncVersion): Promise<MessageItem> {
    const message = localize(
        'outdatedFunctionRuntime',
        'Your Azure Functions Core Tools Version ({0}) is past its end of life. Update to the latest version for the best experience.',
        localVersion
    );
    return await showCoreToolsWarningHelper(context, message);
}

async function showCoreToolsMismatchWarning(context: IActionContext, localVersion: FuncVersion, runtimeVersion: FuncVersion, siteName: string): Promise<MessageItem> {
    const message = localize(
        'mismatchedFunctionRuntime',
        'The local Azure Functions Core Tools Version ({0}) does not match the Azure Functions runtime version ({1}) of function app "{2}". Ensure that the versions match for the best experience.',
        localVersion,
        runtimeVersion,
        siteName
    );
    return await showCoreToolsWarningHelper(context, message);
}
