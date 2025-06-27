/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, type ISubscriptionActionContext, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { ConnectionType } from '../../../../constants';
import { useEmulator } from '../../../../constants-nls';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { type IConnectionPromptOptions } from '../IConnectionPromptOptions';
import { type StorageConnectionType } from '../IConnectionTypesContext';
import { type IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export class AzureWebJobsStoragePromptStep<T extends IAzureWebJobsStorageWizardContext> extends AzureWizardPromptStep<T> {
    public constructor(private readonly options?: IConnectionPromptOptions) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const connectStorageButton: MessageItem = { title: localize('connectStorageAccount', 'Connect Storage Account') };
        const useEmulatorButton: MessageItem = { title: useEmulator };

        const message: string = localize('connectAzureWebJobsStorage', 'In order to proceed, you must connect a storage account for internal use by the Azure Functions runtime.');

        const buttons: MessageItem[] = [connectStorageButton, useEmulatorButton];

        const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true }, ...buttons);
        if (result === connectStorageButton) {
            context.azureWebJobsStorageType = ConnectionType.Azure;
        } else {
            context.azureWebJobsStorageType = ConnectionType.Emulator;
        }

        context.telemetry.properties.azureWebJobsStorageType = context.azureWebJobsStorageType;
    }

    public async configureBeforePrompt(context: T): Promise<void> {
        const matchingConnectionType: StorageConnectionType | undefined = tryFindMatchingConnectionType([context.dtsConnectionType, context.eventHubsConnectionType, context.sqlDbConnectionType]);

        if (this.options?.preselectedConnectionType === ConnectionType.Azure || this.options?.preselectedConnectionType === ConnectionType.Emulator) {
            context.azureWebJobsStorageType = this.options.preselectedConnectionType;
        } else if (!!context.storageAccount || !!context.newStorageAccountName) {
            // Only should prompt if no storage account was selected
            context.azureWebJobsStorageType = ConnectionType.Azure;
        } else if (matchingConnectionType) {
            context.azureWebJobsStorageType = matchingConnectionType;
        }

        // Even if we end up skipping the prompt, we should still record the flow in telemetry
        if (context.azureWebJobsStorageType) {
            context.telemetry.properties.azureWebJobsStorageType = context.azureWebJobsStorageType;
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.azureWebJobsStorageType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T & ISubscriptionActionContext> | undefined> {
        if (context.azureWebJobsStorageType !== ConnectionType.Azure) {
            return undefined;
        }

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
    }
}

const availableStorageConnections: Set<ConnectionType> = new Set([ConnectionType.Azure, ConnectionType.Emulator]);

function tryFindMatchingConnectionType(connections: (ConnectionType | undefined)[]): StorageConnectionType | undefined {
    for (const c of connections) {
        if (!c) {
            continue;
        }

        if (availableStorageConnections.has(c)) {
            return c as StorageConnectionType;
        }
    }
    return undefined;
}
