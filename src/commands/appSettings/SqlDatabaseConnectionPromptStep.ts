/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, ISubscriptionActionContext, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { MessageItem } from 'vscode';
import { ConnectionKey, ConnectionType } from '../../constants';
import { skipForNow } from '../../constants-nls';
import { ext } from '../../extensionVariables';
import { getLocalConnectionString } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { SqlServerListStep } from '../createFunction/durableSteps/sql/SqlServerListStep';
import { IConnectionPromptOptions } from './IConnectionPromptOptions';
import { ISqlDatabaseConnectionWizardContext } from './ISqlDatabaseConnectionWizardContext';
import { SqlDatabaseConnectionCustomPromptStep } from './SqlDatabaseConnectionCustomPromptStep';

export class SqlDatabaseConnectionPromptStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public constructor(private readonly _options?: IConnectionPromptOptions) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const connectAzureDatabase: MessageItem = { title: localize('connectSqlDatabase', 'Connect Azure SQL Database') };
        const connectNonAzureDatabase: MessageItem = { title: localize('connectSqlDatabase', 'Connect Non-Azure SQL Database') };
        const useExistingConnectionButton: MessageItem = { title: localize('useExistingConnection', 'Use Existing Connection') };
        const skipForNowButton: MessageItem = { title: skipForNow };

        const message: string = localize('selectSqlDatabaseConnection', 'In order to proceed, you must connect a SQL database for internal use by the Azure Functions runtime.');

        const buttons: MessageItem[] = [connectAzureDatabase, connectNonAzureDatabase];

        if (!this._options?.suppressSkipForNow) {
            buttons.push(skipForNowButton);
        } else if (this._options?.suppressSkipForNow && !context.sqlDbRemoteConnection) {
            // On debug, give user the option to run from an existing local connection string
            const existingConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.SQL, context.projectPath);
            if (existingConnection) {
                buttons.push(useExistingConnectionButton);
            }
        }

        const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true }, ...buttons);
        if (result === connectAzureDatabase) {
            context.sqlDbConnectionType = ConnectionType.Azure;
        } else if (result === connectNonAzureDatabase) {
            // 'NonAzure' represents any local or remote custom SQL connection that is not hosted through Azure
            context.sqlDbConnectionType = ConnectionType.NonAzure;
        } else {
            context.sqlDbConnectionType = ConnectionType.None;
        }

        context.telemetry.properties.sqlDbConnectionType = context.sqlDbConnectionType;
    }

    public shouldPrompt(context: T): boolean {
        if (this._options?.preSelectedConnectionType) {
            context.sqlDbConnectionType = this._options.preSelectedConnectionType;
        } else if (context.azureWebJobsStorageType) {
            context.sqlDbConnectionType = context.azureWebJobsStorageType;
        }

        // Even if we skip the prompting, we should still record the flow in telemetry
        if (context.sqlDbConnectionType) {
            context.telemetry.properties.sqlDbConnectionType = context.sqlDbConnectionType;
        }

        return !context.sqlDbConnectionType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T & ISubscriptionActionContext> | undefined> {
        if (context.sqlDbConnectionType === ConnectionType.None) {
            return undefined;
        }

        if (context.sqlDbConnectionType === ConnectionType.NonAzure) {
            // 'NonAzure' represents any local or remote custom SQL connection that is not hosted through Azure
            return { promptSteps: [new SqlDatabaseConnectionCustomPromptStep()] };
        }

        const promptSteps: AzureWizardPromptStep<T & ISubscriptionActionContext>[] = [];

        const subscriptionPromptStep: AzureWizardPromptStep<ISubscriptionActionContext> | undefined = await ext.azureAccountTreeItem.getSubscriptionPromptStep(context);
        if (subscriptionPromptStep) {
            promptSteps.push(subscriptionPromptStep);
        }

        promptSteps.push(new SqlServerListStep());

        return { promptSteps };
    }
}
