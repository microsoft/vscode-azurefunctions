/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Database, type SqlManagementClient } from '@azure/arm-sql';
import { LocationListStep, parseAzureResourceId, type AzExtLocation } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullProp, nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { ext } from '../../../../../extensionVariables';
import { localize } from '../../../../../localize';
import { createSqlClient } from '../../../../../utils/azureClients';
import { type ISqlDatabaseAzureConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';

export class SqlDatabaseCreateStep<T extends ISqlDatabaseAzureConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 210;

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        progress.report({ message: localize('creatingDatabase', 'Creating new SQL database...') });

        const client: SqlManagementClient = await createSqlClient(context);

        const parsedServer = parseAzureResourceId(nonNullValueAndProp(context.sqlServer, 'id'))
        const newDatabaseName: string = nonNullProp(context, 'newSqlDatabaseName');

        const location: AzExtLocation = await LocationListStep.getLocation(context);
        const dbParams: Database = {
            location: nonNullProp(location, 'name'),
            sku: {
                name: 'GP_S_Gen5',
                tier: 'GeneralPurpose',
                family: 'Gen5',
                capacity: 1
            },
        };
        context.sqlDatabase = await client.databases.beginCreateOrUpdateAndWait(parsedServer.resourceGroup, parsedServer.resourceName, newDatabaseName, dbParams);
        ext.outputChannel.appendLog(localize('createdDatabase', 'Successfully created new SQL database "{0}"', context.sqlDatabase.name));

        // Todo: This should be its own step
        progress.report({ message: localize('configuringFirewallRules', 'Allowing all Azure IP\'s...') });
        await client.firewallRules.createOrUpdate(parsedServer.resourceGroup, parsedServer.resourceName, 'AllowAllAzureIps', { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' });
        ext.outputChannel.appendLog(localize('configureFirewall', 'Successfully configured new firewall rule for server "{0}" to allow all Azure IPs', context.sqlServer?.name));
    }

    public shouldExecute(context: T): boolean {
        return !context.sqlDatabase;
    }
}
