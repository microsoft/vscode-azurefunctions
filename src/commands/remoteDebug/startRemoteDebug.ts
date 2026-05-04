/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SiteConfig, type StringDictionary } from '@azure/arm-appservice';
import * as appservice from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { workerRuntimeKey } from '../../constants';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { pickFunctionApp } from '../../utils/pickFunctionApp';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { remoteDebugJavaFunctionApp } from '../remoteDebugJava/remoteDebugJavaFunctionApp';
import { getRemoteDebugLanguage } from './getRemoteDebugLanguage';

export async function startRemoteDebug(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await pickFunctionApp(context);
    }

    await node.initSite(context);
    const siteClient = await node.site.createClient(context);

    // Check if Java remote debugging is enabled and if this is a Java function app
    const isJavaRemoteDebuggingEnabled: boolean = !!getWorkspaceSetting<boolean>('enableJavaRemoteDebugging');
    if (isJavaRemoteDebuggingEnabled) {
        const appSettings: StringDictionary = await siteClient.listApplicationSettings();
        const workerRuntime: string | undefined = appSettings.properties?.[workerRuntimeKey];

        // If this is a Java app, delegate to Java remote debugging
        if (workerRuntime?.toLowerCase() === 'java') {
            return await remoteDebugJavaFunctionApp(context, node);
        }
    }

    const siteConfig: SiteConfig = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, cancellable: true }, async (progress, token) => {
        appservice.reportMessage('Fetching site configuration...', progress, token);
        return await siteClient.getSiteConfig();
    });

    const appServicePlan = await siteClient.getAppServicePlan();
    const language: appservice.RemoteDebugLanguage = getRemoteDebugLanguage(siteConfig, appServicePlan?.sku?.family);

    await appservice.startRemoteDebug(context, {
        site: node.site,
        siteConfig,
        language,
        credentials: node.site.subscription.credentials
    });
}
