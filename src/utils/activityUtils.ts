/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ExecuteActivityContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../extensionVariables";
import { getWorkspaceSetting } from "../vsCodeConfig/settings";

export async function createActivityContext(options?: { withChildren?: boolean }): Promise<ExecuteActivityContext> {
    return {
        registerActivity: async (activity) => ext.rgApi.registerActivity(activity),
        suppressNotification: await getWorkspaceSetting('suppressActivityNotifications', undefined, 'azureResourceGroups'),
        activityChildren: options?.withChildren ? [] : undefined,
    };
}
