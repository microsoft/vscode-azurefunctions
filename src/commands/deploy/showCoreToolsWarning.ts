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

export async function showCoreToolsWarning(context: IActionContext, projectVersion: FuncVersion): Promise<void> {
    const showCoreToolsWarningKey: string = 'showCoreToolsWarning';
    if (getWorkspaceSetting<boolean>(showCoreToolsWarningKey)) {
        const coreToolsVersion = await getLocalFuncCoreToolsVersion(context, undefined)
        if (coreToolsVersion !== null) {
            const localVersion = nonNullValue(tryParseFuncVersion(coreToolsVersion), 'localCoreToolsVersion');
            let result: MessageItem | undefined;

            if (localVersion === FuncVersion.v2 || localVersion === FuncVersion.v3) {
                result = await showCoreToolsEOLWarning(context, localVersion);
                while (result === DialogResponses.learnMore) {
                    await openUrl(funcVersionLink);
                    result = await showCoreToolsEOLWarning(context, localVersion);
                }
                if (result === DialogResponses.dontWarnAgain) {
                    await updateGlobalSetting(showCoreToolsWarningKey, false);
                }
            } else if (localVersion !== projectVersion) {
                result = await showCoreToolsMismatchWarning(context, localVersion, projectVersion);
                while (result === DialogResponses.learnMore) {
                    await openUrl(funcVersionLink);
                    result = await showCoreToolsMismatchWarning(context, localVersion, projectVersion);
                }
                if (result === DialogResponses.dontWarnAgain) {
                    await updateGlobalSetting(showCoreToolsWarningKey, false);
                }
            }
        }
    }
}

async function showCoreToolsEOLWarning(context: IActionContext, localVersion: FuncVersion): Promise<MessageItem> {
    const message = localize(
        'outdatedFunctionRuntime',
        'Your Azure Functions Core Tools Version ({0}) is past its end of life. Update to the latest version for the best experience.',
        localVersion
    );
    return await context.ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain)
}

async function showCoreToolsMismatchWarning(context: IActionContext, localVersion: FuncVersion, projectVersion: FuncVersion): Promise<MessageItem> {
    const message = localize(
        'mismatchedFunctionRuntime',
        'Your Azure Functions Core Tools Version ({0}) does not match your Azure Functions runtime version ({1}). Update to the latest version for the best experience.',
        localVersion,
        projectVersion
    );
    return await context.ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain)
}
