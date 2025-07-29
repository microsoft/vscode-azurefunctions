/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Server, type SqlManagementClient } from '@azure/arm-sql';
import { LocationListStep, type AzExtLocation } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullProp, nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { ext } from '../../../../../extensionVariables';
import { localize } from '../../../../../localize';
import { createSqlClient } from '../../../../../utils/azureClients';
import { type ISqlDatabaseAzureConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';

export class SqlServerCreateStep<T extends ISqlDatabaseAzureConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 205;

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        progress.report({ message: localize('creatingServer', 'Creating new SQL server...') });

        const client: SqlManagementClient = await createSqlClient(context);
        const resourceGroupName: string = nonNullValueAndProp(context.resourceGroup, 'name');
        const newServerName: string = nonNullProp(context, 'newSqlServerName');

        const location: AzExtLocation = await LocationListStep.getLocation(context);
        const serverOptions: Server = {
            location: nonNullProp(location, 'name'),
            administratorLogin: nonNullProp(context, 'newSqlAdminUsername'),
            administratorLoginPassword: nonNullProp(context, 'newSqlAdminPassword'),
        };

        context.sqlServer = await client.servers.beginCreateOrUpdateAndWait(resourceGroupName, newServerName, serverOptions);
        ext.outputChannel.appendLog(localize('createdServer', 'Successfully created SQL server "{0}".', context.sqlServer.name));
    }

    public shouldExecute(context: T): boolean {
        return !context.sqlServer;
    }
}
