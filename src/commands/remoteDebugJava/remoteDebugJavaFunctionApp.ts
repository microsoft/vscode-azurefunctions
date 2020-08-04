/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import * as portfinder from 'portfinder';
import * as vscode from 'vscode';
import { SiteClient } from 'vscode-azureappservice';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { openUrl } from '../../utils/openUrl';
import { DebugProxy } from './DebugProxy';

const HTTP_PLATFORM_DEBUG_PORT: string = '8898';
const JAVA_OPTS: string = `-Djava.net.preferIPv4Stack=true -Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=127.0.0.1:${HTTP_PLATFORM_DEBUG_PORT}`;

export async function remoteDebugJavaFunctionApp(context: IActionContext, node?: SlotTreeItemBase): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context);
    }
    const client: SiteClient = node.root.client;
    const portNumber: number = await portfinder.getPortPromise();
    const publishCredential: WebSiteManagementModels.User = await client.getWebAppPublishCredential();
    const debugProxy: DebugProxy = new DebugProxy(client, portNumber, publishCredential);

    debugProxy.on('error', (err: Error) => {
        debugProxy.dispose();
        throw err;
    });

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, async (p: vscode.Progress<{}>) => {
        // tslint:disable-next-line:no-any
        return new Promise(async (resolve: () => void, reject: (e: any) => void): Promise<void> => {
            try {
                const siteConfig: WebSiteManagementModels.SiteConfigResource = await client.getSiteConfig();
                const appSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();
                if (needUpdateSiteConfig(siteConfig) || (appSettings.properties && needUpdateAppSettings(appSettings.properties))) {
                    const confirmMsg: string = localize('confirmRemoteDebug', 'The configurations of the selected app will be changed before debugging. Would you like to continue?');
                    const result: vscode.MessageItem = await ext.ui.showWarningMessage(confirmMsg, { modal: true }, DialogResponses.yes, DialogResponses.learnMore, DialogResponses.cancel);
                    if (result === DialogResponses.learnMore) {
                        await openUrl('https://aka.ms/azfunc-remotedebug');
                        return;
                    } else {
                        await updateSiteConfig(client, p, siteConfig);
                        await updateAppSettings(client, p, appSettings);
                    }
                }

                p.report({ message: 'starting debug proxy...' });
                ext.outputChannel.appendLog('starting debug proxy...');
                // tslint:disable-next-line:no-floating-promises
                debugProxy.startProxy();
                debugProxy.on('start', resolve);
            } catch (error) {
                reject(error);
            }
        });
    });

    const sessionId: string = Date.now().toString();

    await vscode.debug.startDebugging(undefined, {
        name: sessionId,
        type: 'java',
        request: 'attach',
        hostName: 'localhost',
        port: portNumber
    });

    const terminateDebugListener: vscode.Disposable = vscode.debug.onDidTerminateDebugSession((event: vscode.DebugSession) => {
        if (event.name === sessionId) {
            if (debugProxy !== undefined) {
                debugProxy.dispose();
            }
            terminateDebugListener.dispose();
        }
    });

}

async function updateSiteConfig(client: SiteClient, p: vscode.Progress<{}>, siteConfig: WebSiteManagementModels.SiteConfigResource): Promise<void> {
    p.report({ message: 'Fetching site configuration...' });
    ext.outputChannel.appendLog('Fetching site configuration...');
    if (needUpdateSiteConfig(siteConfig)) {
        siteConfig.use32BitWorkerProcess = false;
        siteConfig.webSocketsEnabled = true;
        p.report({ message: 'Updating site configuration to enable remote debugging...' });
        ext.outputChannel.appendLog('Updating site configuration to enable remote debugging...');
        await client.updateConfiguration(siteConfig);
        p.report({ message: 'Updating site configuration done...' });
        ext.outputChannel.appendLog('Updating site configuration done...');
    }
}

async function updateAppSettings(client: SiteClient, p: vscode.Progress<{}>, appSettings: WebSiteManagementModels.StringDictionary): Promise<void> {
    p.report({ message: 'Fetching application settings...' });
    ext.outputChannel.appendLog('Fetching application settings...');
    if (appSettings.properties && needUpdateAppSettings(appSettings.properties)) {
        appSettings.properties.JAVA_OPTS = JAVA_OPTS;
        appSettings.properties.HTTP_PLATFORM_DEBUG_PORT = HTTP_PLATFORM_DEBUG_PORT;
        p.report({ message: 'Updating application settings to enable remote debugging...' });
        ext.outputChannel.appendLog('Updating application settings to enable remote debugging...');
        await client.updateApplicationSettings(appSettings);
        p.report({ message: 'Updating application settings done...' });
        ext.outputChannel.appendLog('Updating application settings done...');
    }
}

function needUpdateSiteConfig(siteConfig: WebSiteManagementModels.SiteConfigResource): boolean {
    return siteConfig.use32BitWorkerProcess || !siteConfig.webSocketsEnabled;
}

function needUpdateAppSettings(properties: {}): boolean | undefined {
    // tslint:disable-next-line:no-string-literal
    return properties['JAVA_OPTS'] !== JAVA_OPTS || properties['HTTP_PLATFORM_DEBUG_PORT'] !== HTTP_PLATFORM_DEBUG_PORT;
}
