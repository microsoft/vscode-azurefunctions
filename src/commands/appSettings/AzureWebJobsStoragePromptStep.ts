/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, ISubscriptionActionContext, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { MessageItem } from 'vscode';
import { ConnectionType, ConnectionTypeValues } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize, skipForNow, useEmulator } from '../../localize';
import { IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';
import { IConnectionPromptOptions } from './IConnectionPrompOptions';
export class AzureWebJobsStoragePromptStep<T extends IAzureWebJobsStorageWizardContext> extends AzureWizardPromptStep<T> {
    public constructor(private readonly _options?: IConnectionPromptOptions) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        if (this._options?.preSelectedConnectionType) {
            context.azureWebJobsStorageType = this._options.preSelectedConnectionType;
            context.telemetry.properties.azureWebJobsStorageType = this._options.preSelectedConnectionType;
            return;
        }

        const connectStorageButton: MessageItem = { title: localize('connectStorageAccount', 'Connect Storage Account') };
        const useEmulatorButton: MessageItem = { title: useEmulator };
        const skipForNowButton: MessageItem = { title: skipForNow };

        const message: string = localize('connectAzureWebJobsStorage', 'In order to proceed, you must connect a storage account for internal use by the Azure Functions runtime.');

        const buttons: MessageItem[] = [connectStorageButton, useEmulatorButton];

        if (!this._options?.suppressSkipForNow) {
            buttons.push(skipForNowButton);
        }

        const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true }, ...buttons);
        if (result === connectStorageButton) {
            context.azureWebJobsStorageType = ConnectionType.Azure;
        } else if (result === useEmulatorButton) {
            context.azureWebJobsStorageType = ConnectionType.NonAzure;
        } else {
            context.azureWebJobsStorageType = ConnectionType.None;
        }

        context.telemetry.properties.azureWebJobsStorageType = context.azureWebJobsStorageType;
    }

    public shouldPrompt(context: T & { eventHubConnectionType?: ConnectionTypeValues, sqlDbConnectionType?: ConnectionTypeValues }): boolean {
        if (!!context.storageAccount || !!context.newStorageAccountName) {
            context.azureWebJobsStorageType = ConnectionType.Azure;  // Only should prompt if no storage account was selected
        } else if (context.eventHubConnectionType) {
            context.azureWebJobsStorageType = context.eventHubConnectionType;
        } else if (context.sqlDbConnectionType === ConnectionType.Azure || context.sqlDbConnectionType === ConnectionType.None) {
            context.azureWebJobsStorageType = context.sqlDbConnectionType;
        }

        // Even if we skip the prompting, we should still record the flow in telemetry
        if (context.azureWebJobsStorageType) {
            context.telemetry.properties.azureWebJobsStorageType = context.azureWebJobsStorageType;
        }

        return !context.azureWebJobsStorageType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T & ISubscriptionActionContext> | undefined> {
        if (context.azureWebJobsStorageType === ConnectionType.Azure) {
            const promptSteps: AzureWizardPromptStep<T & ISubscriptionActionContext>[] = [];

            const subscriptionPromptStep: AzureWizardPromptStep<ISubscriptionActionContext> | undefined = await ext.azureAccountTreeItem.getSubscriptionPromptStep(context);
            if (subscriptionPromptStep) {
                promptSteps.push(subscriptionPromptStep);
            }

            promptSteps.push(new StorageAccountListStep(
                { // INewStorageAccountDefaults
                    kind: StorageAccountKind.Storage,
                    performance: StorageAccountPerformance.Standard,
                    replication: StorageAccountReplication.LRS
                },
                { // IStorageAccountFilters
                    kind: [StorageAccountKind.BlobStorage],
                    performance: [StorageAccountPerformance.Premium],
                    replication: [StorageAccountReplication.ZRS],
                    learnMoreLink: 'https://aka.ms/Cfqnrc'
                }
            ));

            return { promptSteps };
        } else {
            return undefined;
        }
    }
}
