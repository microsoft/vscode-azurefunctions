/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteLogsConfig } from 'azure-arm-website/lib/models';
import * as appservice from 'vscode-azureappservice';
import { SiteClient } from 'vscode-azureappservice';
import { DialogResponses } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { FunctionAppTreeItem } from '../../tree/FunctionAppTreeItem';
import { FunctionTreeItem } from '../../tree/FunctionTreeItem';

export async function startStreamingLogs(treeItem?: FunctionAppTreeItem | FunctionTreeItem): Promise<void> {
    if (!treeItem) {
        treeItem = <FunctionAppTreeItem>await ext.tree.showTreeItemPicker(FunctionAppTreeItem.contextValue);
    }

    const client: SiteClient = treeItem.root.client;
    const verifyLoggingEnabled: () => Promise<void> = async (): Promise<void> => {
        const logsConfig: SiteLogsConfig = await client.getLogsConfig();
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

    await appservice.startStreamingLogs(treeItem.root.client, verifyLoggingEnabled, treeItem.logStreamLabel, treeItem.logStreamPath);
}

function isApplicationLoggingEnabled(config: SiteLogsConfig): boolean {
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
