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

/**
 * Creates a copy of the context with a fresh activity context so that sub-wizards
 * don't share activity log state (e.g. activityChildren) with the calling wizard.
 */
export async function cloneWithNewActivityContext<T extends ExecuteActivityContext>(context: T): Promise<T> {
    return { ...context, ...await createActivityContext() };
}
