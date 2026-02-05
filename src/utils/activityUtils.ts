/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ExecuteActivityContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../extensionVariables";
import { getWorkspaceSetting } from "../vsCodeConfig/settings";

export async function createActivityContext(options?: { withChildren?: boolean, overrideExtensionVariables?: typeof ext }): Promise<ExecuteActivityContext> {
    const _ext = options?.overrideExtensionVariables || ext;
    return {
        registerActivity: async (activity) => _ext.rgApi.registerActivity(activity),
        suppressNotification: await getWorkspaceSetting('suppressActivityNotifications', undefined, 'azureResourceGroups'),
        activityChildren: options?.withChildren ? [] : undefined,
    };
}
