/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import * as vscode from 'vscode';
import * as appservice from 'vscode-azureappservice';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { getRemoteDebugLanguage } from './getRemoteDebugLanguage';

export async function startRemoteDebug(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context);
    }

    const siteClient: appservice.SiteClient = node.root.client;
    const siteConfig: WebSiteManagementModels.SiteConfig = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, cancellable: true }, async (progress, token) => {
        appservice.reportMessage('Fetching site configuration...', progress, token);
        return await siteClient.getSiteConfig();
    });

    const language: appservice.RemoteDebugLanguage = getRemoteDebugLanguage(siteConfig);

    await appservice.startRemoteDebug(context, siteClient, siteConfig, language);
}
