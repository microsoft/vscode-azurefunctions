/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Database, Server, SqlManagementClient } from '@azure/arm-sql';
import { getResourceGroupFromId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions, ISubscriptionContext, IWizardOptions, nonNullProp, nonNullValue } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { createSqlClient } from '../../../../utils/azureClients';
import { ISqlDatabaseConnectionWizardContext } from '../../../appSettings/ISqlDatabaseConnectionWizardContext';
import { SqlDatabaseCreateStep } from './SqlDatabaseCreateStep';
import { SqlDatabaseNameStep } from './SqlDatabaseNameStep';

export class SqlDatabaseListStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const client: SqlManagementClient = await createSqlClient(<T & ISubscriptionContext>context);
        const rgName: string = getResourceGroupFromId(nonNullValue(context.sqlServer?.id));
        const serverName: string = nonNullValue(context.sqlServer?.name);

        const quickPickOptions: IAzureQuickPickOptions = { placeHolder: localize('selectSqlDatabase', 'Select a SQL database.') };
        const picksTask: Promise<IAzureQuickPickItem<Database | undefined>[]> = this.getQuickPicks(uiUtils.listAllIterator(client.databases.listByServer(rgName, serverName)));

        const result: Database | undefined = (await context.ui.showQuickPick(picksTask, quickPickOptions)).data;
        context.sqlDatabase = result;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T & ISubscriptionContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<T & ISubscriptionContext>[] = [];

        if (context.sqlDatabase) {
            context.valuesToMask.push(nonNullProp(context.sqlDatabase, 'name'));
        } else {
            promptSteps.push(new SqlDatabaseNameStep());
            executeSteps.push(new SqlDatabaseCreateStep());
        }

        return { promptSteps, executeSteps };
    }

    public shouldPrompt(context: T): boolean {
        // We need a sql server to list out its databases.  If we don't have a sql server built yet, that means we can skip the listing and go straight to naming
        return !context.sqlDatabase && !!context.sqlServer;
    }

    private async getQuickPicks(dbTask: Promise<Server[]>): Promise<IAzureQuickPickItem<Database | undefined>[]> {
        const picks: IAzureQuickPickItem<Server | undefined>[] = [{
            label: localize('newSqlDatabase', '$(plus) Create new SQL database'),
            description: '',
            data: undefined
        }];

        const dbs: Database[] = await dbTask;
        for (const db of dbs) {
            picks.push({
                id: db.id,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                label: db.name!,
                description: '',
                data: db
            });
        }

        return picks;
    }
}
