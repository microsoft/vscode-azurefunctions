/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocationListStep, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication, VerifyProvidersStep, type ILocationWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, createSubscriptionContext, subscriptionExperience, type AzureWizardExecuteStep, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { ConnectionType, StorageAccountsResourceType, StorageProvider } from '../../../../constants';
import { useEmulator } from '../../../../constants-nls';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { type StorageConnectionType } from '../IConnectionTypesContext';
import { type IStorageAzureConnectionWizard, type IStorageConnectionWizardContext } from './IStorageConnectionWizardContext';
import { StorageConnectionSetSettingStep } from './StorageConnectionSetSettingStep';
import { StorageAccountGetConnectionStep } from './azure/StorageAccountGetConnectionStep';
import { StorageEmulatorGetConnectionStep } from './emulator/StorageEmulatorGetConnectionStep';

export class StorageConnectionListStep<T extends IStorageConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public constructor(readonly connectionTypes: Set<Exclude<ConnectionType, 'Custom'>>) {
        super();
    }

    public async configureBeforePrompt(context: T | IStorageAzureConnectionWizard): Promise<void> {
        const matchingConnectionType: StorageConnectionType | undefined = tryFindMatchingConnectionType([context.dtsConnectionType, context.eventHubsConnectionType, context.sqlDbConnectionType]);

        if (!!(context as IStorageAzureConnectionWizard).storageAccount || !!(context as IStorageAzureConnectionWizard).newStorageAccountName) {
            context.azureWebJobsStorageType = ConnectionType.Azure;
        } else if (matchingConnectionType) {
            context.azureWebJobsStorageType = matchingConnectionType;
        }
    }

    public async prompt(context: T): Promise<void> {
        const connectAzureButton = { title: localize('connectStorageAccount', 'Connect Azure Storage Account'), data: ConnectionType.Azure };
        const connectEmulatorButton = { title: useEmulator, data: ConnectionType.Emulator };
        const skipForNow = { title: localize('skipForNow', 'Skip for now'), data: undefined };

        const buttons: MessageItem[] = [];
        if (this.connectionTypes.has(ConnectionType.Azure)) {
            buttons.push(connectAzureButton);
        }
        if (this.connectionTypes.has(ConnectionType.Emulator)) {
            buttons.push(connectEmulatorButton);
        }

        buttons.push(skipForNow);

        const message: string = localize('connectAzureWebJobsStorage', 'In order to proceed, you must connect a storage account for internal use by the Azure Functions runtime.');
        context.azureWebJobsStorageType = (await context.ui.showWarningMessage(message, { modal: true }, ...buttons) as {
            title: string;
            data: Exclude<ConnectionType, 'Custom'>;
        }).data;
    }

    public shouldPrompt(context: T): boolean {
        return !context.azureWebJobsStorageType;
    }

    public async getSubWizard(context: T | IStorageAzureConnectionWizard): Promise<IWizardOptions<T | IStorageAzureConnectionWizard> | undefined> {
        const promptSteps: AzureWizardPromptStep<T | IStorageAzureConnectionWizard>[] = [];
        const executeSteps: AzureWizardExecuteStep<T | IStorageAzureConnectionWizard>[] = [];

        context.telemetry.properties.azureWebJobsStorageType = context.azureWebJobsStorageType;

        switch (context.azureWebJobsStorageType) {
            case ConnectionType.Azure:
                if (!(context as IStorageAzureConnectionWizard).subscriptionId) {
                    Object.assign(context, createSubscriptionContext(await subscriptionExperience(context, ext.rgApiV2.resources.azureResourceTreeDataProvider)));
                }

                LocationListStep.addProviderForFiltering(context as unknown as ILocationWizardContext, StorageProvider, StorageAccountsResourceType);

                if (!(context as IStorageAzureConnectionWizard).storageAccount) {
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
                    ) as AzureWizardPromptStep<IStorageAzureConnectionWizard>);
                    LocationListStep.addStep(context, promptSteps as AzureWizardPromptStep<ILocationWizardContext>[]);

                    executeSteps.push(new VerifyProvidersStep<IStorageAzureConnectionWizard>([StorageProvider]));
                }

                executeSteps.push(new StorageAccountGetConnectionStep());
                break;
            case ConnectionType.Emulator:
                executeSteps.push(new StorageEmulatorGetConnectionStep());
                break;
            default:
                return undefined;
        }

        executeSteps.push(new StorageConnectionSetSettingStep());

        return { promptSteps, executeSteps };
    }
}

export const availableStorageConnections = new Set([ConnectionType.Azure, ConnectionType.Emulator]) satisfies Set<Exclude<ConnectionType, 'Custom'>>;

function tryFindMatchingConnectionType(connections: (ConnectionType | undefined)[]): StorageConnectionType | undefined {
    for (const c of connections) {
        if (!c) {
            continue;
        }

        if ((availableStorageConnections as Set<ConnectionType>).has(c)) {
            return c as StorageConnectionType;
        }
    }
    return undefined;
}
