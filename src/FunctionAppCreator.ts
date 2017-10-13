/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureAccountWrapper } from "vscode-azureappservice";
import { AppServicePlanStep, AppKind, QuickPickItemWithData, ResourceGroupStep, SubscriptionStep, WebsiteCreatorBase, WebsiteCreatorStepBase, WebsiteOS, WebsiteNameStep, WebsiteStep } from "vscode-azureappservice";
import { SubscriptionModels, ResourceManagementClient, ResourceModels } from 'azure-arm-resource';
import StorageManagementClient = require('../node_modules/azure-arm-storage');
import StorageAccount from '../node_modules/azure-arm-storage/lib/models/storageAccount';
import Sku from '../node_modules/azure-arm-storage/lib/models/sku';
import { UserCancelledError } from 'vscode-azureappservice';
import { WizardBase, WizardStep } from "vscode-azureappservice";
import * as WebSiteModels from '../node_modules/azure-arm-website/lib/models';
import { localize } from "./localize";
import { randomUtils } from "vscode-azureappservice";

export class FunctionAppCreator extends WebsiteCreatorBase {
    constructor(output: vscode.OutputChannel, readonly azureAccount: AzureAccountWrapper, subscription: SubscriptionModels.Subscription, persistence?: vscode.Memento) {
        super(output, azureAccount, subscription, persistence);
    }

    protected appKind: AppKind = "functionapp";
    protected websiteOS: WebsiteOS = "windows";

    protected initSteps(): void {
        this.steps.push(new SubscriptionStep(this, this.azureAccount, { prompt: "Select the subscription to create the new Function App in." }, this.subscription, this.persistence));
        this.steps.push(new WebsiteNameStep(this, this.azureAccount, this.appKind, this.persistence));
        this.steps.push(new ResourceGroupStep(this, this.azureAccount, this.persistence));
        this.steps.push(new StorageAccountStep(this, this.azureAccount, this.persistence));
        this.steps.push(new FunctionAppWebsiteStep(this, this.azureAccount, this.appKind, this.websiteOS, this.persistence));
    }

    protected beforeExecute(_step: WizardStep, stepIndex: number) {
        if (stepIndex == 0) {
            this.writeline(localize('azFunc.CreatingFuncApp', 'Creating new Function App in Azure...'));
        }
    }

    protected onExecuteError(error: Error) {
        if (error instanceof UserCancelledError) {
            return;
        }
        this.writeline(localize("azFunc.FailedCreatingFuncApp", "Failed to create new Function App in Azure: {0}", error.message));
        this.writeline('');
    }
}

export class StorageAccountStep extends WebsiteCreatorStepBase {
    private _createNew: boolean;
    private _account: {
        name: string;
        sku: Sku;
        location: string;
        resourceGroupName: string;
    };

    constructor(wizard: WizardBase, azureAccount: AzureAccountWrapper, persistence?: vscode.Memento) {
        super(wizard, 'Select or create a storage account', azureAccount, persistence);
    }

    async prompt(): Promise<void> {
        const createNewItem: QuickPickItemWithData<StorageAccount> = {
            persistenceId: "",
            label: '$(plus) Create New Storage Account',
            description: null,
            data: null
        };
        const quickPickOptions = { placeHolder: `Select a storage account that supports blobs, queues and tables. (${this.stepProgressText})` };
        const subscription = this.getSelectedSubscription();
        const storageClient = new StorageManagementClient(this.azureAccount.getCredentialByTenantId(subscription.tenantId), subscription.subscriptionId);

        var storageTask = storageClient.storageAccounts.list();
        var storageAccounts: StorageAccount[];

        const quickPickItemsTask = storageTask.then(storageAccounts => {
            const quickPickItems: QuickPickItemWithData<StorageAccount>[] = [createNewItem];

            storageAccounts.forEach(sa => {
                quickPickItems.push({
                    persistenceId: sa.id,
                    label: sa.name,
                    description: "", // asdf `(${locations.find(l => l.name.toLowerCase() === sa.location.toLowerCase()).displayName})`,
                    detail: '',
                    data: sa
                });
            });

            return quickPickItems;
        });

        // Cache storage account separately per subscription
        const result = <QuickPickItemWithData<StorageAccount>>await this.showQuickPick(quickPickItemsTask, quickPickOptions, `"NewWebApp.StorageAccount/${subscription.id}`);

        if (result.data) {
            this._createNew = false;

            var [, resourceGroupName] = result.data.id.match(/\/resourceGroups\/([^/]+)\//);
            this._account = {
                name: result.data.name,
                location: result.data.location,
                sku: result.data.sku,
                resourceGroupName: resourceGroupName
            };
            return;
        }

        this._createNew = true;

        var suggestedName = await this.computeRelatedName();
        var newAccountName: string;
        var nameValid = false;
        while (!nameValid) {
            newAccountName = await this.showInputBox({
                value: suggestedName,
                prompt: 'Enter the name of the new storage account.',
                validateInput: (value: string): string => {
                    value = value ? value.trim() : '';

                    if (!value.match(/^[a-z0-9]{3,24}$/ig)) {
                        return 'Storage account name must contain 3-24 lowercase characters or numbers';
                    }

                    return null;
                }
            });

            // Check if the name has already been taken...
            var nameAvailability = await storageClient.storageAccounts.checkNameAvailability(newAccountName);
            if (!nameAvailability.nameAvailable) {
                await vscode.window.showWarningMessage(nameAvailability.message);
            } else {
                nameValid = true;
            }
        }

        this._account = {
            name: newAccountName.trim(),
            sku: { name: "Standard_LRS" },
            location: this.getSelectedResourceGroup().location,
            resourceGroupName: this.getSelectedResourceGroup().name
        }
    }

    async execute(): Promise<void> {
        if (!this._createNew) {
            this.wizard.writeline(`Existing storage account "${this._account.name} (${this._account.location})" will be used.`);
            return;
        }

        this.wizard.writeline(`Creating new storage account "${this._account.name} (${this._account.location}, ${this._account.sku.name})"...`);
        const subscription = this.getSelectedSubscription();
        const storageClient = new StorageManagementClient(this.azureAccount.getCredentialByTenantId(subscription.tenantId), subscription.subscriptionId);
        var account = await storageClient.storageAccounts.create(this.getSelectedResourceGroup().name,
            this._account.name,
            {
                sku: this._account.sku,
                kind: "Storage",
                location: this._account.location
            }
        );
        this.wizard.writeline(`Storage account created.`);
    }

    public get storageAccount(): StorageAccount {
        return this._account;
    }

    public get createNew(): boolean {
        return this._createNew;
    }
}

export class FunctionAppWebsiteStep extends WebsiteStep {
    public async getSiteConfig(linuxFxVersion: string): Promise<WebSiteModels.SiteConfig> {
        const maxFileShareNameLength = 63;
        const subscription = this.getSelectedSubscription();
        const storageClient = new StorageManagementClient(this.azureAccount.getCredentialByTenantId(subscription.tenantId), subscription.subscriptionId);

        var storageAccountStep = this.wizard.findStepOfType(StorageAccountStep);
        var accountName = storageAccountStep.storageAccount.name;

        var keys = await storageClient.storageAccounts.listKeys(storageAccountStep.storageAccount.resourceGroupName, accountName);
        var accountKey = keys.keys[0].value;
        var siteName = this.website.name;

        var fileShareName = siteName.toLocaleLowerCase() + "-content".slice(0, maxFileShareNameLength);
        if (!storageAccountStep.createNew) {
            var randomLetters = 4;
            fileShareName = fileShareName.slice(0, maxFileShareNameLength - randomLetters - 1) + "-" + randomUtils.getRandomHexString(randomLetters);
        }

        return <WebSiteModels.SiteConfig>{
            linuxFxVersion: linuxFxVersion,
            appSettings: [
                {
                    name: "AzureWebJobsDashboard",
                    value: 'DefaultEndpointsProtocol=https;AccountName=' + storageAccountStep.storageAccount.name + ';AccountKey=' + accountKey
                },
                {
                    name: "AzureWebJobsStorage",
                    value: 'DefaultEndpointsProtocol=https;AccountName=' + storageAccountStep.storageAccount.name + ';AccountKey=' + accountKey
                },
                {
                    name: "FUNCTIONS_EXTENSION_VERSION",
                    value: "~1" // This means use latest version with major version "1"
                },
                {
                    name: "WEBSITE_CONTENTAZUREFILECONNECTIONSTRING",
                    value: 'DefaultEndpointsProtocol=https;AccountName=' + storageAccountStep.storageAccount.name + ';AccountKey=' + accountKey
                },
                {
                    name: "WEBSITE_CONTENTSHARE",
                    value: fileShareName
                },
                {
                    name: "WEBSITE_NODE_DEFAULT_VERSION",
                    value: "6.5.0"
                }
            ],
            clientAffinityEnabled: false
        }
    };
}
