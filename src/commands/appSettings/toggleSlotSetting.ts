/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from "vscode-azureappservice";
import { ext } from "../../extensionVariables";

export async function toggleSlotSetting(node?: AppSettingTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<AppSettingTreeItem>(AppSettingTreeItem.contextValue);
    }

    await node.toggleSlotSetting();
}
