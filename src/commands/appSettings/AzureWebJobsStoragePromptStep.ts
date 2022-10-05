/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, ISubscriptionActionContext, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { MessageItem } from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export class AzureWebJobsStoragePromptStep<T extends IAzureWebJobsStorageWizardContext> extends AzureWizardPromptStep<T> {
    private readonly _suppressSkipForNow?: boolean;

    public constructor(suppressSkipForNow?: boolean) {
        super();
        this._suppressSkipForNow = suppressSkipForNow;
    }

    public async prompt(context: T): Promise<void> {
        const selectAccount: MessageItem = { title: localize('selectAzureAccount', 'Select storage account') };
        const useEmulator: MessageItem = { title: localize('userEmulator', 'Use local emulator') };
        const skipForNow: MessageItem = { title: localize('skipForNow', 'Skip for now') };

        const message: string = localize('selectAzureWebJobsStorage', 'In order to debug, you must select a storage account for internal use by the Azure Functions runtime.');

        const buttons: MessageItem[] = [selectAccount];
        if (process.platform === 'win32') {
            // Only show on Windows until Azurite is officially supported: https://github.com/Azure/azure-functions-core-tools/issues/1247
            buttons.push(useEmulator);
        }
        if (!this._suppressSkipForNow) {
            buttons.push(skipForNow);
        }

        const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true }, ...buttons);
        if (result === selectAccount) {
            context.azureWebJobsStorageType = 'azure';
        } else if (result === useEmulator) {
            context.azureWebJobsStorageType = 'emulator';
        }

        context.telemetry.properties.azureWebJobsStorageType = context.azureWebJobsStorageType || 'skipForNow';
    }

    public shouldPrompt(context: T): boolean {
        // Only should prompt if no storage account was selected
        context.azureWebJobsStorageType = (!!context.storageAccount || !!context.newStorageAccountName) ? 'azure' : undefined;
        return !context.azureWebJobsStorageType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T & ISubscriptionActionContext> | undefined> {
        if (context.azureWebJobsStorageType === 'azure') {
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
