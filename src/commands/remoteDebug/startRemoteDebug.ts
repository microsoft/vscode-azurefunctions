/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SiteConfig } from '@azure/arm-appservice';
import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { pickFunctionApp } from '../../utils/pickFunctionApp';
import { getRemoteDebugLanguage } from './getRemoteDebugLanguage';

export async function startRemoteDebug(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await pickFunctionApp(context);
    }

    const siteClient = await (await node.getSite(context)).createClient(context);
    const siteConfig: SiteConfig = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, cancellable: true }, async (progress, token) => {
        appservice.reportMessage('Fetching site configuration...', progress, token);
        return await siteClient.getSiteConfig();
    });

    const appServicePlan = await siteClient.getAppServicePlan();
    const language: appservice.RemoteDebugLanguage = getRemoteDebugLanguage(siteConfig, appServicePlan?.sku?.family);

    await appservice.startRemoteDebug(context, {
        site: (await node.getSite(context)),
        siteConfig,
        language,
        credentials: (await node.getSite(context)).subscription.credentials
    });
}
