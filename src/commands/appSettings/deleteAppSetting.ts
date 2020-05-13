/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from 'vscode-azureappservice';
import { AzExtTreeItem, ITreeItemActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';

export async function deleteAppSetting(context: ITreeItemActionContext, arg1?: AzExtTreeItem): Promise<void> {
    context.suppressCreatePick = true;
    const node: AppSettingTreeItem = await ext.tree.showTreeItemWizard(AppSettingTreeItem.contextValueId, context, arg1);
    await node.deleteAppSetting(context);
}
