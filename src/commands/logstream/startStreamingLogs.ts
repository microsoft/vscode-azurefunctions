/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import * as appservice from 'vscode-azureappservice';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { ProductionSlotTreeItem } from '../../tree/ProductionSlotTreeItem';
import { RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';

export async function startStreamingLogs(context: IActionContext, treeItem?: SlotTreeItemBase | RemoteFunctionTreeItem): Promise<void> {
    if (!treeItem) {
        treeItem = await ext.tree.showTreeItemPicker<SlotTreeItemBase>(ProductionSlotTreeItem.contextValue, context);
    }

    const client: appservice.SiteClient = treeItem.client;
    const verifyLoggingEnabled: () => Promise<void> = async (): Promise<void> => {
        const logsConfig: WebSiteManagementModels.SiteLogsConfig = await client.getLogsConfig();
        if (!isApplicationLoggingEnabled(logsConfig)) {
            const message: string = localize('enableApplicationLogging', 'Do you want to enable application logging for "{0}"?', client.fullName);
            await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.cancel);
            // tslint:disable-next-line:strict-boolean-expressions
            logsConfig.applicationLogs = logsConfig.applicationLogs || {};
            // tslint:disable-next-line:strict-boolean-expressions
            logsConfig.applicationLogs.fileSystem = logsConfig.applicationLogs.fileSystem || {};
            logsConfig.applicationLogs.fileSystem.level = 'Information';
            // Azure will throw errors if these have incomplete information (aka missing a sasUrl). Since we already know these are turned off, just make them undefined
            logsConfig.applicationLogs.azureBlobStorage = undefined;
            logsConfig.applicationLogs.azureTableStorage = undefined;
            await client.updateLogsConfig(logsConfig);
        }
    };

    await appservice.startStreamingLogs(client, verifyLoggingEnabled, treeItem.logStreamLabel, treeItem.logStreamPath);
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
