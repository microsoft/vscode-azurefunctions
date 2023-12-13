/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Server, type SqlManagementClient } from '@azure/arm-sql';
import { LocationListStep, type AzExtLocation } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullProp, nonNullValue, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { createSqlClient } from '../../../../utils/azureClients';
import { type ISqlDatabaseConnectionWizardContext } from '../../../appSettings/connectionSettings/sqlDatabase/ISqlDatabaseConnectionWizardContext';

export class SqlServerCreateStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 205;

    public async execute(context: T & ISubscriptionContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const client: SqlManagementClient = await createSqlClient(<T & ISubscriptionContext>context);
        const rgName: string = nonNullValue(context.resourceGroup?.name);
        const newServerName: string = nonNullProp(context, 'newSqlServerName');

        const creating: string = localize('creatingSqlServer', 'Creating new SQL server "{0}"...', newServerName);
        ext.outputChannel.appendLog(creating);
        progress.report({ message: creating });

        const location: AzExtLocation = await LocationListStep.getLocation(<T & ISubscriptionContext>context);
        const serverOptions: Server = {
            location: nonNullProp(location, 'name'),
            administratorLogin: nonNullProp(context, 'newSqlAdminUsername'),
            administratorLoginPassword: nonNullProp(context, 'newSqlAdminPassword'),
        };

        context.sqlServer = await client.servers.beginCreateOrUpdateAndWait(rgName, newServerName, serverOptions);
    }

    public shouldExecute(context: T): boolean {
        return !context.sqlServer;
    }
}
