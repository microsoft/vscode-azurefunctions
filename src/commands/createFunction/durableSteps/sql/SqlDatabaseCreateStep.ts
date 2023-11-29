/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Database, type SqlManagementClient } from '@azure/arm-sql';
import { LocationListStep, getResourceGroupFromId, type AzExtLocation } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullProp, nonNullValue, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { createSqlClient } from '../../../../utils/azureClients';
import { type ISqlDatabaseConnectionWizardContext } from '../../../appSettings/connectionSettings/sqlDatabase/ISqlDatabaseConnectionWizardContext';

export class SqlDatabaseCreateStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 210;

    public async execute(context: T & ISubscriptionContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const client: SqlManagementClient = await createSqlClient(<T & ISubscriptionContext>context);
        const serverName: string = nonNullValue(context.sqlServer?.name);
        const rgName: string = getResourceGroupFromId(nonNullValue(context.sqlServer?.id));
        const newDatabaseName: string = nonNullProp(context, 'newSqlDatabaseName');

        const creating: string = localize('creatingSqlDatabase', 'Creating new SQL database "{0}"...', newDatabaseName);
        progress.report({ message: creating });
        ext.outputChannel.appendLog(creating);

        const location: AzExtLocation = await LocationListStep.getLocation(<T & ISubscriptionContext>context);
        const dbParams: Database = {
            location: nonNullProp(location, 'name'),
            sku: {
                name: 'GP_S_Gen5',
                tier: 'GeneralPurpose',
                family: 'Gen5',
                capacity: 1
            },
        };
        context.sqlDatabase = await client.databases.beginCreateOrUpdateAndWait(rgName, serverName, newDatabaseName, dbParams);

        const configuring: string = localize('configuringFirewallRules', 'Configuring SQL server firewall to allow all Azure IP\'s...');
        progress.report({ message: configuring });
        ext.outputChannel.appendLog(configuring);
        await client.firewallRules.createOrUpdate(rgName, serverName, 'AllowAllAzureIps', { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' });
    }

    public shouldExecute(context: T): boolean {
        return !context.sqlDatabase;
    }
}
