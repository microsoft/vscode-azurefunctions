/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../extensionVariables';

export async function editAppSetting(context: IActionContext, node?: AppSettingTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.tree.showTreeItemPicker<AppSettingTreeItem>(AppSettingTreeItem.contextValue, context);
    }

    await node.edit(context);
}
