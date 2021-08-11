/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { setupProjectFolderParsed } from '../../downloadAzureProject/setupProjectFolder';
import { ext } from '../../extensionVariables';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';

export async function downloadProject(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context);
    }

    const filePathUri: vscode.Uri[] = await context.ui.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
    const resourceId: string = node.id;
    const language: string = await getApplicationLanguage(node, context);

    await setupProjectFolderParsed(resourceId, language, filePathUri[0], context, node);
}

async function getApplicationLanguage(node: SlotTreeItemBase, context: IActionContext): Promise<string> {
    const client = await node.site.createClient(context);
    const appSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();

    return !appSettings.properties || !appSettings.properties['FUNCTIONS_WORKER_RUNTIME']
        ? ''
        : appSettings.properties['FUNCTIONS_WORKER_RUNTIME'];
}
