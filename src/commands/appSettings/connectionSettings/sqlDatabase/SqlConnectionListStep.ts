/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocationListStep, ResourceGroupListStep, VerifyProvidersStep, type ILocationWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, createSubscriptionContext, subscriptionExperience, type AzureWizardExecuteStep, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { ConnectionType, SqlProvider, SqlServerResourceType } from '../../../../constants';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { SqlDatabaseGetConnectionStep } from './azure/SqlDatabaseGetConnectionStep';
import { SqlServerListStep } from './azure/SqlServerListStep';
import { SqlDbConnectionCustomPromptStep } from './custom/SqlDbConnectionCustomPromptStep';
import { type ISqlDatabaseAzureConnectionWizardContext, type ISqlDatabaseConnectionWizardContext } from './ISqlDatabaseConnectionWizardContext';
import { SqlDbConnectionSetSettingStep } from './SqlDbConnectionSetSettingStep';

export class SqlConnectionListStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardPromptStep<T> {
    constructor(readonly connectionTypes: Set<Exclude<ConnectionType, 'Emulator'>>) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const connectAzureButton = { title: localize('connectAzureSqlDatabase', 'Connect Azure SQL Database'), data: ConnectionType.Azure };
        const connectCustomButton = { title: localize('connectCustomSqlDatabase', 'Connect Custom SQL Database'), data: ConnectionType.Custom };
        const skipForNow = { title: localize('skipForNow', 'Skip for now'), data: undefined };

        const buttons: MessageItem[] = [];
        if (this.connectionTypes.has(ConnectionType.Azure)) {
            buttons.push(connectAzureButton);
        }
        if (this.connectionTypes.has(ConnectionType.Custom)) {
            buttons.push(connectCustomButton);
        }

        buttons.push(skipForNow);

        const message: string = localize('selectSqlDatabaseConnection', 'In order to proceed, you must connect a SQL database for internal use by the Azure Functions runtime.');
        context.sqlDbConnectionType = (await context.ui.showWarningMessage(message, { modal: true }, ...buttons) as {
            title: string;
            data: Exclude<ConnectionType, 'Emulator'> | undefined;
        }).data;
    }

    public shouldPrompt(context: T): boolean {
        return !context.sqlDbConnectionType;
    }

    public async getSubWizard(context: T | ISqlDatabaseAzureConnectionWizardContext): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T | ISqlDatabaseAzureConnectionWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<T | ISqlDatabaseAzureConnectionWizardContext>[] = [];

        context.telemetry.properties.sqlDbConnectionType = context.sqlDbConnectionType;

        switch (context.sqlDbConnectionType) {
            case ConnectionType.Azure:
                if (!(context as ISqlDatabaseAzureConnectionWizardContext).subscriptionId) {
                    Object.assign(context, createSubscriptionContext(await subscriptionExperience(context, ext.rgApiV2.resources.azureResourceTreeDataProvider)));
                }

                LocationListStep.addProviderForFiltering(context as unknown as ILocationWizardContext, SqlProvider, SqlServerResourceType);

                promptSteps.push(
                    new ResourceGroupListStep() as AzureWizardPromptStep<ISqlDatabaseAzureConnectionWizardContext>,
                    new SqlServerListStep(),
                );

                executeSteps.push(
                    new VerifyProvidersStep<ISqlDatabaseAzureConnectionWizardContext>([SqlProvider]),
                    new SqlDatabaseGetConnectionStep(),
                )
                break;
            case ConnectionType.Custom:
                promptSteps.push(new SqlDbConnectionCustomPromptStep());
                break;
            default:
                return undefined;
        }

        executeSteps.push(new SqlDbConnectionSetSettingStep());

        return { promptSteps, executeSteps };
    }
}
