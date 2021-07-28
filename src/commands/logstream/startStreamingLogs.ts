/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApplicationInsightsManagementClient, ApplicationInsightsManagementModels as AIModels } from '@azure/arm-appinsights';
import { WebSiteManagementModels } from '@azure/arm-appservice';
import * as appservice from 'vscode-azureappservice';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { createAppInsightsClient } from '../../utils/azureClients';
import { nonNullProp } from '../../utils/nonNull';
import { openUrl } from '../../utils/openUrl';
import { enableFileLogging } from './enableFileLogging';

export async function startStreamingLogs(context: IActionContext, treeItem?: SlotTreeItemBase | RemoteFunctionTreeItem): Promise<void> {
    if (!treeItem) {
        treeItem = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context);
    }

    const client: appservice.SiteClient = treeItem.client;

    if (client.isLinux) {
        try {
            // https://github.com/microsoft/vscode-azurefunctions/issues/1472
            await appservice.pingFunctionApp(treeItem.client);
        } catch {
            // ignore and open portal anyways
        }

        await openLiveMetricsStream(treeItem);
    } else {
        const verifyLoggingEnabled: () => Promise<void> = async (): Promise<void> => {
            const logsConfig: WebSiteManagementModels.SiteLogsConfig = await client.getLogsConfig();
            if (!isApplicationLoggingEnabled(logsConfig)) {
                const message: string = localize('enableApplicationLogging', 'Do you want to enable application logging for "{0}"?', client.fullName);
                await context.ui.showWarningMessage(message, { modal: true, stepName: 'enableAppLogging' }, DialogResponses.yes);
                await enableFileLogging(client, logsConfig);
            }
        };

        await appservice.startStreamingLogs(context, client, verifyLoggingEnabled, treeItem.logStreamLabel, treeItem.logStreamPath);
    }
}

/**
 * Linux Function Apps only support streaming through App Insights
 * For initial support, we will just open the "Live Metrics Stream" view in the portal
 */
async function openLiveMetricsStream(treeItem: SlotTreeItemBase | RemoteFunctionTreeItem): Promise<void> {
    const appSettings: WebSiteManagementModels.StringDictionary = await treeItem.client.listApplicationSettings();
    const aiKey: string | undefined = appSettings.properties && appSettings.properties.APPINSIGHTS_INSTRUMENTATIONKEY;
    if (!aiKey) {
        // https://github.com/microsoft/vscode-azurefunctions/issues/1432
        throw new Error(localize('mustConfigureAI', 'You must configure Application Insights to stream logs on Linux Function Apps.'));
    } else {
        const aiClient: ApplicationInsightsManagementClient = await createAppInsightsClient(treeItem.root);
        const components: AIModels.ApplicationInsightsComponentListResult = await aiClient.components.list();
        const component: AIModels.ApplicationInsightsComponent | undefined = components.find(c => c.instrumentationKey === aiKey);
        if (!component) {
            throw new Error(localize('failedToFindAI', 'Failed to find application insights component.'));
        } else {
            const componentId: string = encodeURIComponent(JSON.stringify({
                Name: treeItem.client.fullName,
                SubscriptionId: treeItem.root.subscriptionId,
                ResourceGroup: treeItem.client.resourceGroup
            }));
            const resourceId: string = encodeURIComponent(nonNullProp(component, 'id'));

            // Not using `openInPortal` because this url is so unconventional
            const url: string = `${treeItem.root.environment.portalUrl}/#blade/AppInsightsExtension/QuickPulseBladeV2/ComponentId/${componentId}/ResourceId/${resourceId}`;
            await openUrl(url);
        }
    }
}

function isApplicationLoggingEnabled(config: WebSiteManagementModels.SiteLogsConfig): boolean {
    if (config.applicationLogs) {
        if (config.applicationLogs.fileSystem) {
            return config.applicationLogs.fileSystem.level !== undefined && config.applicationLogs.fileSystem.level.toLowerCase() !== 'off';
        } else if (config.applicationLogs.azureBlobStorage) {
            return config.applicationLogs.azureBlobStorage.level !== undefined && config.applicationLogs.azureBlobStorage.level.toLowerCase() !== 'off';
        } else if (config.applicationLogs.azureTableStorage) {
            return config.applicationLogs.azureTableStorage.level !== undefined && config.applicationLogs.azureTableStorage.level.toLowerCase() !== 'off';
        }
    }

    return false;
}
