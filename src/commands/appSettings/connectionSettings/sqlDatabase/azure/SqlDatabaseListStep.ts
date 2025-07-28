/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Database, type SqlManagementClient } from '@azure/arm-sql';
import { parseAzureResourceId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, nonNullValueAndProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localSettingsDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { createSqlClient } from '../../../../../utils/azureClients';
import { type ISqlDatabaseAzureConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';
import { SqlDatabaseCreateStep } from './SqlDatabaseCreateStep';
import { SqlDatabaseNameStep } from './SqlDatabaseNameStep';

export class SqlDatabaseListStep<T extends ISqlDatabaseAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const client: SqlManagementClient = await createSqlClient(context);
        const parsedResource = parseAzureResourceId(nonNullValueAndProp(context.sqlServer, 'id'));

        const databases: Database[] | undefined = await uiUtils.listAllIterator(client.databases.listByServer(parsedResource.resourceGroup, parsedResource.resourceName));

        context.sqlDatabase = (await context.ui.showQuickPick(this.getPicks(context, databases), {
            placeHolder: localize('selectSqlDatabase', 'Select a SQL database.'),
        })).data;

        if (context.sqlDatabase?.name) {
            context.valuesToMask.push(context.sqlDatabase.name);
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.sqlDatabase && !!context.sqlServer;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        if (!context.sqlDatabase) {
            promptSteps.push(new SqlDatabaseNameStep());
            executeSteps.push(new SqlDatabaseCreateStep());
        }

        return { promptSteps, executeSteps };
    }

    private async getPicks(context: T, databases: Database[]): Promise<IAzureQuickPickItem<Database | undefined>[]> {
        const picks: IAzureQuickPickItem<Database | undefined>[] = [{
            label: localize('newSqlDatabase', '$(plus) Create new SQL database'),
            data: undefined,
        }];

        for (const db of databases) {
            const databaseName: string = nonNullProp(db, 'name');
            picks.push({
                label: databaseName,
                description: databaseName === context.suggestedSqlDbLocalSettings ? localSettingsDescription : undefined,
                data: db,
            });
        }

        return picks;
    }
}
