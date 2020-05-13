/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingsTreeItem } from 'vscode-azureappservice';
import { ITreeItemWizardContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';

export async function addAppSetting(context: ITreeItemWizardContext, node?: AppSettingsTreeItem): Promise<void> {
    await ext.tree.showCreateWizard(AppSettingsTreeItem.contextValue, context, node);
}
