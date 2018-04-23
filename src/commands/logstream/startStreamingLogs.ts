/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteLogsConfig } from 'azure-arm-website/lib/models';
import * as vscode from 'vscode';
import * as appservice from 'vscode-azureappservice';
import { AzureTreeDataProvider, DialogResponses, IAzureNode } from 'vscode-azureextensionui';
import TelemetryReporter from 'vscode-extension-telemetry';
import { localize } from '../../localize';
import { FunctionAppTreeItem } from '../../tree/FunctionAppTreeItem';
import { ILogStreamTreeItem } from './ILogStreamTreeItem';

export async function startStreamingLogs(context: vscode.ExtensionContext, reporter: TelemetryReporter | undefined, tree: AzureTreeDataProvider, node?: IAzureNode<ILogStreamTreeItem>): Promise<void> {
    if (!node) {
        node = <IAzureNode<ILogStreamTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }

    const treeItem: ILogStreamTreeItem = node.treeItem;
    if (treeItem.logStream && treeItem.logStream.isConnected) {
        // tslint:disable-next-line:no-non-null-assertion
        treeItem.logStreamOutputChannel!.show();
        await node.ui.showWarningMessage(localize('logStreamAlreadyActive', 'The log-streaming service for "{0}" is already active.', treeItem.logStreamLabel));
    } else {
        const logsConfig: SiteLogsConfig = await treeItem.client.getLogsConfig();
        if (!isApplicationLoggingEnabled(logsConfig)) {
            const message: string = localize('enableApplicationLogging', 'Do you want to enable application logging for "{0}"?', treeItem.client.fullName);
            await node.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.cancel);
            // tslint:disable-next-line:strict-boolean-expressions
            logsConfig.applicationLogs = logsConfig.applicationLogs || {};
            // tslint:disable-next-line:strict-boolean-expressions
            logsConfig.applicationLogs.fileSystem = logsConfig.applicationLogs.fileSystem || {};
            logsConfig.applicationLogs.fileSystem.level = 'Information';
            // Azure will throw errors if these have incomplete information (aka missing a sasUrl). Since we already know these are turned off, just make them undefined
            logsConfig.applicationLogs.azureBlobStorage = undefined;
            logsConfig.applicationLogs.azureTableStorage = undefined;
            await treeItem.client.updateLogsConfig(logsConfig);
        }

        if (!treeItem.logStreamOutputChannel) {
            const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(localize('logStreamLabel', '{0} - Log Stream', treeItem.logStreamLabel));
            context.subscriptions.push(outputChannel);
            treeItem.logStreamOutputChannel = outputChannel;
        }
        treeItem.logStream = await appservice.startStreamingLogs(treeItem.client, reporter, treeItem.logStreamOutputChannel, treeItem.logStreamPath);
    }
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
