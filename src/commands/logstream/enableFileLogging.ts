/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { ParsedSite } from 'vscode-azureappservice';
import { IActionContext } from 'vscode-azureextensionui';

export async function enableFileLogging(context: IActionContext, site: ParsedSite, logsConfig?: WebSiteManagementModels.SiteLogsConfig): Promise<void> {
    const client = await site.createClient(context);
    logsConfig = logsConfig || await client.getLogsConfig();

    logsConfig.applicationLogs = logsConfig.applicationLogs || {};
    logsConfig.applicationLogs.fileSystem = logsConfig.applicationLogs.fileSystem || {};
    logsConfig.applicationLogs.fileSystem.level = 'Information';
    // Azure will throw errors if these have incomplete information (aka missing a sasUrl). Since we already know these are turned off, just make them undefined
    logsConfig.applicationLogs.azureBlobStorage = undefined;
    logsConfig.applicationLogs.azureTableStorage = undefined;
    await client.updateLogsConfig(logsConfig);
}
