/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, ISubscriptionWizardContext, ISubWizardOptions, StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication } from 'vscode-azureextensionui';
import { localSettingsFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { getLocalAppSettings, ILocalAppSettings } from '../../../LocalAppSettings';
import { localize } from '../../../localize';
import { IFunctionSetting, ResourceType } from '../../../templates/IFunctionSetting';
import { CosmosDBConnectionCreateStep } from '../azureSteps/CosmosDBConnectionCreateStep';
import { CosmosDBListStep } from '../azureSteps/CosmosDBListStep';
import { ServiceBusConnectionCreateStep } from '../azureSteps/ServiceBusConnectionCreateStep';
import { ServiceBusListStep } from '../azureSteps/ServiceBusListStep';
import { StorageConnectionCreateStep } from '../azureSteps/StorageConnectionCreateStep';
import { IFunctionWizardContext } from '../IFunctionWizardContext';
import { LocalAppSettingCreateStep } from './LocalAppSettingCreateStep';
import { LocalAppSettingNameStep } from './LocalAppSettingNameStep';
import { LocalAppSettingValueStep } from './LocalAppSettingValueStep';

export class LocalAppSettingListStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    private readonly _setting: IFunctionSetting;

    constructor(setting: IFunctionSetting) {
        super();
        this._setting = setting;
    }

    public async prompt(wizardContext: IFunctionWizardContext): Promise<ISubWizardOptions<IFunctionWizardContext> | void> {
        const localSettingsPath: string = path.join(wizardContext.functionAppPath, localSettingsFileName);
        const settings: ILocalAppSettings = await getLocalAppSettings(localSettingsPath);
        if (settings.Values) {
            const existingSettings: string[] = Object.keys(settings.Values);
            if (existingSettings.length > 0) {
                let picks: IAzureQuickPickItem<string | undefined>[] = [{ label: localize('newAppSetting', '$(plus) Create new local app setting'), data: undefined }];
                picks = picks.concat(existingSettings.map((s: string) => { return { data: s, label: s }; }));
                const placeHolder: string = localize('selectAppSetting', 'Select setting from "{0}"', localSettingsFileName);
                const result: string | undefined = (await ext.ui.showQuickPick(picks, { placeHolder })).data;
                if (result) {
                    wizardContext[this._setting.name] = result;
                    return;
                }
            }
        }

        const azurePromptSteps: AzureWizardPromptStep<IFunctionWizardContext & ISubscriptionWizardContext>[] = [];
        const azureExecuteSteps: AzureWizardExecuteStep<IFunctionWizardContext & ISubscriptionWizardContext>[] = [];
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
    }

    public shouldPrompt(wizardContext: IFunctionWizardContext): boolean {
        return !wizardContext[this._setting.name];
    }
}
