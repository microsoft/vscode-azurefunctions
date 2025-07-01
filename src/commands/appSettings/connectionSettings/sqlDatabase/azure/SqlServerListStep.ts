/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Server, type SqlManagementClient } from '@azure/arm-sql';
import { LocationListStep, uiUtils, type ILocationWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, ConfirmPreviousInputStep, nonNullProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { SqlProvider, SqlServerResourceType } from '../../../../../constants';
import { localSettingsDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { createSqlClient } from '../../../../../utils/azureClients';
import { type ISqlDatabaseAzureConnectionWizardContext } from '../ISqlDatabaseConnectionWizardContext';
import { SqlDatabaseListStep } from './SqlDatabaseListStep';
import { SqlServerCreateStep } from './SqlServerCreateStep';
import { SqlServerNameStep } from './SqlServerNameStep';
import { SqlServerPasswordAuthStep } from './SqlServerPasswordAuthStep';
import { SqlServerUsernameAuthStep } from './SqlServerUsernameAuthStep';

export class SqlServerListStep<T extends ISqlDatabaseAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const client: SqlManagementClient = await createSqlClient(context);
        const servers: Server[] | undefined = await uiUtils.listAllIterator(client.servers.list());

        context.sqlServer = (await context.ui.showQuickPick(this.getPicks(context, servers), {
            placeHolder: localize('selectSqlServer', 'Select a SQL server.'),
        })).data;

        if (context.sqlServer?.name) {
            context.valuesToMask.push(context.sqlServer.name);
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.sqlServer;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        if (!context.sqlServer) {
            LocationListStep.addProviderForFiltering(context as unknown as ILocationWizardContext, SqlProvider, SqlServerResourceType);
            LocationListStep.addStep(context, promptSteps as AzureWizardPromptStep<ILocationWizardContext>[]);

            promptSteps.push(new SqlServerNameStep(), new SqlServerUsernameAuthStep(), new SqlServerPasswordAuthStep(), new ConfirmPreviousInputStep('newSqlAdminPassword', { isPassword: true }));
            executeSteps.push(new SqlServerCreateStep());
        }

        if (!context.sqlDatabase) {
            promptSteps.push(new SqlDatabaseListStep());
        }

        return { promptSteps, executeSteps };
    }

    private async getPicks(context: T, servers: Server[]): Promise<IAzureQuickPickItem<Server | undefined>[]> {
        const picks: IAzureQuickPickItem<Server | undefined>[] = [{
            label: localize('newSqlServer', '$(plus) Create new SQL server'),
            data: undefined,
        }];

        for (const s of servers) {
            const serverName: string = nonNullProp(s, 'name');
            picks.push({
                label: serverName,
                description: serverName === context.suggestedSqlServerLocalSettings ? localSettingsDescription : undefined,
                data: s,
            });
        }

        return picks;
    }
}
