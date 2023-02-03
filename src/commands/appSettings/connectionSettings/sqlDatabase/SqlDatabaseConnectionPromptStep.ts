/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, ISubscriptionActionContext, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { MessageItem } from 'vscode';
import { ConnectionType } from '../../../../constants';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { SqlServerListStep } from '../../../createFunction/durableSteps/sql/SqlServerListStep';
import { IConnectionPromptOptions } from '../IConnectionPromptOptions';
import { ISqlDatabaseConnectionWizardContext } from './ISqlDatabaseConnectionWizardContext';
import { SqlDatabaseConnectionCustomPromptStep } from './SqlDatabaseConnectionCustomPromptStep';

export class SqlDatabaseConnectionPromptStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public constructor(private readonly options?: IConnectionPromptOptions) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const connectAzureDatabase: MessageItem = { title: localize('connectAzureSqlDatabase', 'Connect Azure SQL Database') };
        const connectCustomDatabase: MessageItem = { title: localize('connectCustomSqlDatabase', 'Connect Custom SQL Database') };

        const message: string = localize('selectSqlDatabaseConnection', 'In order to proceed, you must connect a SQL database for internal use by the Azure Functions runtime.');

        const buttons: MessageItem[] = [connectAzureDatabase, connectCustomDatabase];

        const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true }, ...buttons);
        if (result === connectAzureDatabase) {
            context.sqlDbConnectionType = ConnectionType.Azure;
        } else {
            context.sqlDbConnectionType = ConnectionType.Custom;
        }

        context.telemetry.properties.sqlDbConnectionType = context.sqlDbConnectionType;
    }

    public async configureBeforePrompt(context: T): Promise<void> {
        if (this.options?.preselectedConnectionType === ConnectionType.Azure || this.options?.preselectedConnectionType === ConnectionType.Custom) {
            context.sqlDbConnectionType = this.options.preselectedConnectionType;
        } else if (context.azureWebJobsStorageType === ConnectionType.Azure) {
            context.sqlDbConnectionType = context.azureWebJobsStorageType;
        }

        // Even if we skip the prompting, we should still record the flow in telemetry
        if (context.sqlDbConnectionType) {
            context.telemetry.properties.sqlDbConnectionType = context.sqlDbConnectionType;
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.sqlDbConnectionType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T & ISubscriptionActionContext> | undefined> {
        const promptSteps: AzureWizardPromptStep<T & ISubscriptionActionContext>[] = [];

        if (context.sqlDbConnectionType === ConnectionType.Custom) {
            promptSteps.push(new SqlDatabaseConnectionCustomPromptStep());
        } else {
            const subscriptionPromptStep: AzureWizardPromptStep<ISubscriptionActionContext> | undefined = await ext.azureAccountTreeItem.getSubscriptionPromptStep(context);
            if (subscriptionPromptStep) {
                promptSteps.push(subscriptionPromptStep);
            }

            promptSteps.push(new SqlServerListStep());
        }

        return { promptSteps };
    }
}
