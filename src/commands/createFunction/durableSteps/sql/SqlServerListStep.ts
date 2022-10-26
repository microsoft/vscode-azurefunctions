/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server, SqlManagementClient } from '@azure/arm-sql';
import { LocationListStep, ResourceGroupListStep, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions, ISubscriptionContext, IWizardOptions, nonNullProp } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { createSqlClient } from '../../../../utils/azureClients';
import { ISqlDatabaseConnectionWizardContext } from '../../../appSettings/ISqlDatabaseConnectionWizardContext';
import { SqlServerCreateStep } from './SqlServerCreateStep';
import { SqlServerNameStep } from './SqlServerNameStep';
import { SqlServerPasswordAuthStep } from './SqlServerPasswordAuthStep';
import { SqlServerUsernameAuthStep } from './SqlServerUsernameAuthStep';

export class SqlServerListStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const client: SqlManagementClient = await createSqlClient(<T & ISubscriptionContext>context);

        const quickPickOptions: IAzureQuickPickOptions = { placeHolder: 'Select a SQL server.' };
        const picksTask: Promise<IAzureQuickPickItem<Server | undefined>[]> = this._getQuickPicks(uiUtils.listAllIterator(client.servers.list()));

        const result: Server | undefined = (await context.ui.showQuickPick(picksTask, quickPickOptions)).data;
        context.sqlServer = result;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T & ISubscriptionContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<T & ISubscriptionContext>[] = [];

        if (context.sqlServer) {
            context.valuesToMask.push(nonNullProp(context.sqlServer, 'name'));
        } else {
            promptSteps.push(new SqlServerNameStep(), new SqlServerUsernameAuthStep(), new SqlServerPasswordAuthStep());
            executeSteps.push(new SqlServerCreateStep());
        }

        LocationListStep.addStep(context, promptSteps);
        promptSteps.push(new ResourceGroupListStep());

        return { promptSteps, executeSteps };
    }

    public shouldPrompt(context: T): boolean {
        return !context.sqlServer;
    }

    private async _getQuickPicks(serverTask: Promise<Server[]>): Promise<IAzureQuickPickItem<Server | undefined>[]> {
        const picks: IAzureQuickPickItem<Server | undefined>[] = [{
            label: localize('newSqlServer', '$(plus) Create new SQL server'),
            description: '',
            data: undefined
        }];

        const sqlServers: Server[] = await serverTask;
        for (const server of sqlServers) {
            picks.push({
                id: server.id,
                label: server.name!,
                description: '',
                data: server
            });
        }

        return picks;
    }
}
