/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SiteConfigResource, type StringDictionary, type User } from '@azure/arm-appservice';
import { type SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { DialogResponses, findFreePort, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { openUrl } from '../../utils/openUrl';
import { pickFunctionApp } from '../../utils/pickFunctionApp';
import { DebugProxy } from './DebugProxy';

const HTTP_PLATFORM_DEBUG_PORT: string = '8898';
const JAVA_OPTS: string = `-Djava.net.preferIPv4Stack=true -Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=127.0.0.1:${HTTP_PLATFORM_DEBUG_PORT}`;

export async function remoteDebugJavaFunctionApp(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await pickFunctionApp(context);
    }
    await node.initSite(context);
    const client: SiteClient = await node.site.createClient(context);
    const portNumber: number = await findFreePort();
    const publishCredential: User = await client.getWebAppPublishCredential();
    const debugProxy: DebugProxy = new DebugProxy(node.site, portNumber, publishCredential);

    debugProxy.on('error', (err: Error) => {
        debugProxy.dispose();
        throw err;
    });

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, async (p: vscode.Progress<{}>) => {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/no-explicit-any, no-async-promise-executor
        return new Promise(async (resolve: (value: unknown) => void, reject: (e: any) => void): Promise<void> => {
            try {
                const siteConfig: SiteConfigResource = await client.getSiteConfig();
                const appSettings: StringDictionary = await client.listApplicationSettings();
                if (needUpdateSiteConfig(siteConfig) || (appSettings.properties && needUpdateAppSettings(appSettings.properties))) {
                    const confirmMsg: string = localize('confirmRemoteDebug', 'The configurations of the selected app will be changed before debugging. Would you like to continue?');
                    const result: vscode.MessageItem = await context.ui.showWarningMessage(confirmMsg, { modal: true }, DialogResponses.yes, DialogResponses.learnMore);
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
                void debugProxy.startProxy(context);
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

async function updateSiteConfig(client: SiteClient, p: vscode.Progress<{}>, siteConfig: SiteConfigResource): Promise<void> {
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

async function updateAppSettings(client: SiteClient, p: vscode.Progress<{}>, appSettings: StringDictionary): Promise<void> {
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

function needUpdateSiteConfig(siteConfig: SiteConfigResource): boolean {
    return siteConfig.use32BitWorkerProcess || !siteConfig.webSocketsEnabled;
}

function needUpdateAppSettings(properties: {}): boolean | undefined {
    return properties['JAVA_OPTS'] !== JAVA_OPTS || properties['HTTP_PLATFORM_DEBUG_PORT'] !== HTTP_PLATFORM_DEBUG_PORT;
}
