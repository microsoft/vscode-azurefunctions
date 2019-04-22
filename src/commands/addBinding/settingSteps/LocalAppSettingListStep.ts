/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, ISubscriptionWizardContext, IWizardOptions, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication } from 'vscode-azureextensionui';
import { localSettingsFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { getLocalSettingsJson, ILocalSettingsJson } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { IFunctionSetting, ResourceType } from '../../../templates/IFunctionSetting';
import { IBindingWizardContext } from '../IBindingWizardContext';
import { CosmosDBConnectionCreateStep } from './cosmosDB/CosmosDBConnectionCreateStep';
import { CosmosDBListStep } from './cosmosDB/CosmosDBListStep';
import { LocalAppSettingCreateStep } from './LocalAppSettingCreateStep';
import { LocalAppSettingNameStep } from './LocalAppSettingNameStep';
import { LocalAppSettingValueStep } from './LocalAppSettingValueStep';
import { ServiceBusConnectionCreateStep } from './serviceBus/ServiceBusConnectionCreateStep';
import { ServiceBusListStep } from './serviceBus/ServiceBusListStep';
import { StorageConnectionCreateStep } from './StorageConnectionCreateStep';

export class LocalAppSettingListStep extends AzureWizardPromptStep<IBindingWizardContext> {
    private readonly _setting: IFunctionSetting;

    constructor(setting: IFunctionSetting) {
        super();
        this._setting = setting;
    }

    public async prompt(wizardContext: IBindingWizardContext): Promise<void> {
        const localSettingsPath: string = path.join(wizardContext.projectPath, localSettingsFileName);
        const settings: ILocalSettingsJson = await getLocalSettingsJson(localSettingsPath);
        const existingSettings: string[] = settings.Values ? Object.keys(settings.Values) : [];
        let picks: IAzureQuickPickItem<string | undefined>[] = [{ label: localize('newAppSetting', '$(plus) Create new local app setting'), data: undefined }];
        picks = picks.concat(existingSettings.map((s: string) => { return { data: s, label: s }; }));
        const placeHolder: string = localize('selectAppSetting', 'Select setting from "{0}"', localSettingsFileName);
        const result: string | undefined = (await ext.ui.showQuickPick(picks, { placeHolder })).data;
        if (result) {
            wizardContext[this._setting.name] = result;
        }
    }

    public async getSubWizard(wizardContext: IBindingWizardContext): Promise<IWizardOptions<IBindingWizardContext> | undefined> {
        if (!wizardContext[this._setting.name]) {
            const azurePromptSteps: AzureWizardPromptStep<IBindingWizardContext & ISubscriptionWizardContext>[] = [];
            const azureExecuteSteps: AzureWizardExecuteStep<IBindingWizardContext & ISubscriptionWizardContext>[] = [];
            switch (this._setting.resourceType) {
                case ResourceType.DocumentDB:
                    azurePromptSteps.push(new CosmosDBListStep());
                    azureExecuteSteps.push(new CosmosDBConnectionCreateStep(this._setting));
                    break;
                case ResourceType.Storage:
                    azurePromptSteps.push(new StorageAccountListStep(
                        { kind: StorageAccountKind.Storage, performance: StorageAccountPerformance.Standard, replication: StorageAccountReplication.LRS },
                        { kind: [StorageAccountKind.BlobStorage], learnMoreLink: 'https://aka.ms/T5o0nf' }
                    ));
                    azureExecuteSteps.push(new StorageConnectionCreateStep(this._setting));
                    break;
                case ResourceType.ServiceBus:
                    azurePromptSteps.push(new ServiceBusListStep());
                    azureExecuteSteps.push(new ServiceBusConnectionCreateStep(this._setting));
                    break;
                default:
                    // Unsupported resource type - prompt user to enter connection string manually
                    const valueKey: string = this._setting.name + '_value';
                    return {
                        promptSteps: [new LocalAppSettingNameStep(this._setting), new LocalAppSettingValueStep(valueKey)],
                        executeSteps: [new LocalAppSettingCreateStep(this._setting.name, valueKey)]
                    };
            }

            const subscriptionPromptStep: AzureWizardPromptStep<ISubscriptionWizardContext> | undefined = await ext.tree.getSubscriptionPromptStep(wizardContext);
            if (subscriptionPromptStep) {
                azurePromptSteps.unshift(subscriptionPromptStep);
            }
            return { promptSteps: azurePromptSteps, executeSteps: azureExecuteSteps };
        } else {
            return undefined;
        }
    }

    public shouldPrompt(wizardContext: IBindingWizardContext): boolean {
        return !wizardContext[this._setting.name];
    }
}
