/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageAccountKind, StorageAccountListStep, StorageAccountPerformance, StorageAccountReplication } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, ISubscriptionActionContext, IWizardOptions } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { localSettingsFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { BindingSettingValue } from '../../../funcConfig/function';
import { ILocalSettingsJson, getLocalSettingsJson } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { ResourceType } from '../../../templates/IBindingTemplate';
import { EventHubsNamespaceListStep } from '../../createFunction/durableSteps/netherite/EventHubsNamespaceListStep';
import { getBindingSetting } from '../../createFunction/IFunctionWizardContext';
import { IBindingWizardContext } from '../IBindingWizardContext';
import { IEventHubsConnectionWizardContext } from '../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext';
import { BindingSettingStepBase } from './BindingSettingStepBase';
import { LocalAppSettingCreateStep } from './LocalAppSettingCreateStep';
import { LocalAppSettingNameStep } from './LocalAppSettingNameStep';
import { LocalAppSettingValueStep } from './LocalAppSettingValueStep';
import { StorageConnectionCreateStep } from './StorageConnectionCreateStep';
import { CosmosDBConnectionCreateStep } from './cosmosDB/CosmosDBConnectionCreateStep';
import { CosmosDBListStep } from './cosmosDB/CosmosDBListStep';
import { EventHubAuthRuleListStep } from './eventHub/EventHubAuthRuleListStep';
import { EventHubConnectionCreateStep } from './eventHub/EventHubConnectionCreateStep';
import { EventHubListStep } from './eventHub/EventHubListStep';
import { ServiceBusConnectionCreateStep } from './serviceBus/ServiceBusConnectionCreateStep';
import { ServiceBusListStep } from './serviceBus/ServiceBusListStep';

export class LocalAppSettingListStep extends BindingSettingStepBase {
    public async promptCore(context: IBindingWizardContext): Promise<BindingSettingValue> {
        const localSettingsPath: string = path.join(context.projectPath, localSettingsFileName);
        const settings: ILocalSettingsJson = await getLocalSettingsJson(context, localSettingsPath);
        const existingSettings: string[] = settings.Values ? Object.keys(settings.Values) : [];
        let picks: IAzureQuickPickItem<string | undefined>[] = [{ label: localize('newAppSetting', '$(plus) Create new local app setting'), data: undefined }];
        picks = picks.concat(existingSettings.map((s: string) => { return { data: s, label: s }; }));
        const placeHolder: string = localize('selectAppSetting', 'Select setting from "{0}"', localSettingsFileName);
        return (await context.ui.showQuickPick(picks, { placeHolder })).data;
    }

    public async getSubWizard(context: IBindingWizardContext): Promise<IWizardOptions<IBindingWizardContext> | undefined> {
        if (!getBindingSetting(context, this._setting)) {
            const azurePromptSteps: AzureWizardPromptStep<IBindingWizardContext & ISubscriptionActionContext & IEventHubsConnectionWizardContext>[] = [];
            const azureExecuteSteps: AzureWizardExecuteStep<IBindingWizardContext & ISubscriptionActionContext & IEventHubsConnectionWizardContext>[] = [];
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
                case ResourceType.EventHub:
                    azurePromptSteps.push(new EventHubsNamespaceListStep(), new EventHubListStep(), new EventHubAuthRuleListStep());
                    azureExecuteSteps.push(new EventHubConnectionCreateStep(this._setting));
                    break;
                default:
                    // Unsupported resource type - prompt user to enter connection string manually
                    const valueKey: string = this._setting.name.toLowerCase() + '_value';
                    return {
                        promptSteps: [new LocalAppSettingNameStep(this._setting), new LocalAppSettingValueStep(valueKey)],
                        executeSteps: [new LocalAppSettingCreateStep(this._setting, valueKey)]
                    };
            }

            const subscriptionPromptStep: AzureWizardPromptStep<ISubscriptionActionContext> | undefined = await ext.azureAccountTreeItem.getSubscriptionPromptStep(context);
            if (subscriptionPromptStep) {
                azurePromptSteps.unshift(subscriptionPromptStep);
            }
            return { promptSteps: azurePromptSteps, executeSteps: azureExecuteSteps };
        } else {
            return undefined;
        }
    }
}
