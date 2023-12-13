/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardPromptStep, type AzureWizardExecuteStep, type IAzureQuickPickItem, type ISubscriptionActionContext, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { type IBindingSetting } from "../../../templates/IBindingTemplate";
import { type IEventHubsConnectionWizardContext } from "../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext";
import { type IBindingWizardContext } from "../IBindingWizardContext";
import { StorageConnectionCreateStep } from "./StorageConnectionCreateStep";

export class StorageTypePromptStep extends AzureWizardPromptStep<IBindingWizardContext> {
    private readonly _setting: IBindingSetting;

    constructor(setting: IBindingSetting) {
        super();
        this._setting = setting;
    }

    public async prompt(context: IBindingWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<boolean>[] = [
            { label: localize('useAzurite', 'Use Azurite emulator for local storage'), data: true },
            { label: localize('useAzureStorage', 'Use Azure Storage for remote storage'), data: false }
        ];

        context.useStorageEmulator = (await context.ui.showQuickPick(picks, { placeHolder: localize('selectStorage', 'Select a storage account type for development') })).data;
        return;
    }

    public shouldPrompt(context: IBindingWizardContext): boolean {
        return context.useStorageEmulator === undefined;
    }

    public async getSubWizard(context: IBindingWizardContext): Promise<IWizardOptions<IBindingWizardContext> | undefined> {
        const promptSteps: AzureWizardPromptStep<IBindingWizardContext & ISubscriptionActionContext & IEventHubsConnectionWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<IBindingWizardContext & ISubscriptionActionContext & IEventHubsConnectionWizardContext>[] = [];

        if (!context.useStorageEmulator) {
            promptSteps.push(new StorageAccountListStep(
                { kind: StorageAccountKind.Storage, performance: StorageAccountPerformance.Standard, replication: StorageAccountReplication.LRS },
                { kind: [StorageAccountKind.BlobStorage], learnMoreLink: 'https://aka.ms/T5o0nf' }
            ));
        }

        executeSteps.push(new StorageConnectionCreateStep(this._setting));

        return {
            promptSteps,
            executeSteps
        };
    }
}
