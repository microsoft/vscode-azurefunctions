/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { SiteClient } from 'vscode-azureappservice';

export async function enableFileLogging(client: SiteClient, logsConfig?: WebSiteManagementModels.SiteLogsConfig): Promise<void> {
    // tslint:disable-next-line: strict-boolean-expressions
    logsConfig = logsConfig || await client.getLogsConfig();

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
