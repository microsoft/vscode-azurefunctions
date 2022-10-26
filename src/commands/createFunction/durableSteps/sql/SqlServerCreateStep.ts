/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server, SqlManagementClient } from '@azure/arm-sql';
import { ext } from '@microsoft/vscode-azext-azureappservice/out/src/extensionVariables';
import { ILocationWizardContext, LocationListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, ISubscriptionContext, nonNullValue } from '@microsoft/vscode-azext-utils';
import { Progress } from 'vscode';
import { localize } from '../../../../localize';
import { createSqlClient } from '../../../../utils/azureClients';
import { ISqlDatabaseConnectionWizardContext } from '../../../appSettings/ISqlDatabaseConnectionWizardContext';

export class SqlServerCreateStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 200;

    public async execute(context: T & ISubscriptionContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const client: SqlManagementClient = await createSqlClient(<T & ISubscriptionContext>context);
        const rgName: string = nonNullValue(context.resourceGroup?.name);
        const newServerName: string = nonNullValue(context.newSqlServerName);

        const creating: string = localize('creatingSqlServer', 'Creating new SQL server "{0}"...', newServerName);
        const created: string = localize('createdSqlServer', 'Created new SQL server "{0}"...', newServerName);
        ext.outputChannel.appendLog(creating);
        progress.report({ message: creating });

        const serverOptions: Server = {
            location: (await LocationListStep.getLocation(<ILocationWizardContext>context)).name,
            administratorLogin: nonNullValue(context.newSqlAdminUsername),
            administratorLoginPassword: nonNullValue(context.newSqlAdminPassword),
        };

        context.sqlServer = await client.servers.beginCreateOrUpdateAndWait(rgName, newServerName, serverOptions);
        ext.outputChannel.appendLog(created);
    }

    public shouldExecute(context: T): boolean {
        return !context.sqlDatabase && !!context.resourceGroup && !!context.newSqlServerName && LocationListStep.hasLocation(<ILocationWizardContext>context);
    }
}
