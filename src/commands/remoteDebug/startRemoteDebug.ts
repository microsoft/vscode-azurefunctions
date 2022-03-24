/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteConfig } from '@azure/arm-appservice';
import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { ResolvedFunctionAppResource } from '../../tree/ResolvedFunctionAppResource';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { getRemoteDebugLanguage } from './getRemoteDebugLanguage';

export async function startRemoteDebug(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    if (!node) {
        node = await ext.rgApi.tree.showTreeItemPicker<SlotTreeItemBase>(new RegExp(ResolvedFunctionAppResource.productionContextValue), context);
    }

    const siteClient = await node.site.createClient(context);
    const siteConfig: SiteConfig = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, cancellable: true }, async (progress, token) => {
        appservice.reportMessage('Fetching site configuration...', progress, token);
        return await siteClient.getSiteConfig();
    });

    const language: appservice.RemoteDebugLanguage = getRemoteDebugLanguage(siteConfig);

    await appservice.startRemoteDebug(context, node.site, siteConfig, language);
}
