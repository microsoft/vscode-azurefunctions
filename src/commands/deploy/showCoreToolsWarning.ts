/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext, nonNullValue, openUrl } from "@microsoft/vscode-azext-utils";
import { MessageItem } from "vscode";
import { getLocalFuncCoreToolsVersion } from "../../funcCoreTools/getLocalFuncCoreToolsVersion";
import { FuncVersion, funcVersionLink, tryParseFuncVersion } from "../../FuncVersion";
import { localize } from "../../localize";
import { getWorkspaceSetting, updateGlobalSetting } from "../../vsCodeConfig/settings";

export async function showCoreToolsWarning(context: IActionContext, projectVersion: FuncVersion, projectName: string): Promise<void> {
    const showCoreToolsWarningKey: string = 'showCoreToolsWarning';
    if (getWorkspaceSetting<boolean>(showCoreToolsWarningKey)) {
        const coreToolsVersion = await getLocalFuncCoreToolsVersion(context, undefined)
        if (coreToolsVersion !== null) {
            const localVersion = nonNullValue(tryParseFuncVersion(coreToolsVersion), 'localCoreToolsVersion');

            if (localVersion === FuncVersion.v2 || localVersion === FuncVersion.v3) {
                await showCoreToolsEOLWarning(context, localVersion);
            } else if (localVersion !== projectVersion) {
                await showCoreToolsMismatchWarning(context, localVersion, projectVersion, projectName);
            }
        }
    }
}

async function showCoreToolsWarningHelper(context: IActionContext, message: string): Promise<MessageItem> {
    let result: MessageItem;
    const showCoreToolsWarningKey: string = 'showCoreToolsWarning';
    result = await context.ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
    while (result === DialogResponses.learnMore) {
        await openUrl(funcVersionLink);
        result = await context.ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
    }

    if (result === DialogResponses.dontWarnAgain) {
        await updateGlobalSetting(showCoreToolsWarningKey, false);
    }
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

async function showCoreToolsMismatchWarning(context: IActionContext, localVersion: FuncVersion, projectVersion: FuncVersion, projectName: string): Promise<MessageItem> {
    const message = localize(
        'mismatchedFunctionRuntime',
        'The local Azure Functions Core Tools Version ({0}) does not match the Azure Functions runtime version ({2}) of function app "{1}". Ensure that the versions match for the best experience.',
        localVersion,
        projectName,
        projectVersion
    );
    return await showCoreToolsWarningHelper(context, message);
}
