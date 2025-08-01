/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Database, type SqlManagementClient } from '@azure/arm-sql';
import { parseAzureResourceId } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullProp, nonNullValueAndProp, parseError } from '@microsoft/vscode-azext-utils';
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

        const parsedServer = parseAzureResourceId(nonNullValueAndProp(context.sqlServer, 'id'));
        const newDatabaseName: string = nonNullProp(context, 'newSqlDatabaseName');

        const dbParams: Database = {
            location: nonNullValueAndProp(context.sqlServer, 'location'),
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
        try {
            progress.report({ message: localize('configuringFirewallRules', 'Allowing all Azure IP\'s...') });
            await client.firewallRules.createOrUpdate(parsedServer.resourceGroup, parsedServer.resourceName, 'AllowAllAzureIps', { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' });
            ext.outputChannel.appendLog(localize('configureFirewall', 'Successfully configured new firewall rule for server "{0}" to allow all Azure IPs', context.sqlServer?.name));
        } catch (e) {
            const perr = parseError(e);
            const customErrMessage = localize(
                'sqlServerCreatedFirewallFailed',
                'A SQL server "{0}" was created, but deployment was halted because firewall rules could not be configured to allow Azure traffic.',
                parsedServer.resourceName,
            );
            ext.outputChannel.appendLog(customErrMessage);
            ext.outputChannel.appendLog(perr.message);
            throw new Error(customErrMessage);
        }
    }

    public shouldExecute(context: T): boolean {
        return !context.sqlDatabase;
    }
}
