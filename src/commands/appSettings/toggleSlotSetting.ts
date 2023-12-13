/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { functionFilter } from "../../constants";
import { ext } from "../../extensionVariables";

export async function toggleSlotSetting(context: IActionContext, node?: AppSettingTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<AppSettingTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(AppSettingTreeItem.contextValue)
        });
    }

    await node.toggleSlotSetting(context);
}
