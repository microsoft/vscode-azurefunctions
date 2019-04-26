/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem } from 'vscode';
import { AzureWizardPromptStep, ISubscriptionWizardContext, IWizardOptions, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication } from 'vscode-azureextensionui';
import { localSettingsFileName } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export class AzureWebJobsStoragePromptStep<T extends IAzureWebJobsStorageWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(wizardContext: T): Promise<void> {
        const selectAccount: MessageItem = { title: localize('selectAzureAccount', 'Select storage account') };
        const useEmulator: MessageItem = { title: localize('userEmulator', 'Use local emulator') };

        const message: string = localize('selectAzureWebJobsStorage', 'AzureWebJobsStorage must be set in "{0}" to debug non-HTTP triggers locally.', localSettingsFileName);
        const result: MessageItem = await ext.ui.showWarningMessage(message, { modal: true }, selectAccount, useEmulator);
        if (result === selectAccount) {
            wizardContext.azureWebJobsStorage = 'azure';
        } else if (result === useEmulator) {
            wizardContext.azureWebJobsStorage = 'emulator';
        }
    }

    public shouldPrompt(wizardContext: T): boolean {
        return !wizardContext.azureWebJobsStorage;
    }

    public async getSubWizard(wizardContext: T): Promise<IWizardOptions<T & ISubscriptionWizardContext> | undefined> {
        if (wizardContext.azureWebJobsStorage === 'azure') {
            const promptSteps: AzureWizardPromptStep<T & ISubscriptionWizardContext>[] = [];

            const subscriptionPromptStep: AzureWizardPromptStep<ISubscriptionWizardContext> | undefined = await ext.tree.getSubscriptionPromptStep(wizardContext);
            if (subscriptionPromptStep) {
                promptSteps.push(subscriptionPromptStep);
            }

            promptSteps.push(new StorageAccountListStep(
                { kind: StorageAccountKind.Storage, performance: StorageAccountPerformance.Standard, replication: StorageAccountReplication.LRS },
                {
                    kind: [
                        StorageAccountKind.BlobStorage
                    ],
                    performance: [
                        StorageAccountPerformance.Premium
                    ],
                    replication: [
                        StorageAccountReplication.ZRS
                    ],
                    learnMoreLink: 'https://aka.ms/Cfqnrc'
                }
            ));

            return { promptSteps };
        } else {
            return undefined;
        }
    }
}
