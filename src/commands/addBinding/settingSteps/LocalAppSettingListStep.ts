/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardExecuteStep, type AzureWizardPromptStep, type IAzureQuickPickItem, type ISubscriptionActionContext, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { localSettingsFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { type BindingSettingValue } from '../../../funcConfig/function';
import { getLocalSettingsJson, type ILocalSettingsJson } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { ResourceType } from '../../../templates/IBindingTemplate';
import { type INetheriteConnectionWizardContext as IEventHubsConnectionWizardContext } from '../../appSettings/connectionSettings/netherite/INetheriteConnectionWizardContext';
import { EventHubsNamespaceListStep } from '../../appSettings/connectionSettings/netherite/azure/EventHubsNamespaceListStep';
import { getBindingSetting, type FunctionV2WizardContext, type IFunctionWizardContext } from '../../createFunction/IFunctionWizardContext';
import { BindingSettingStepBase } from './BindingSettingStepBase';
import { LocalAppSettingCreateStep } from './LocalAppSettingCreateStep';
import { LocalAppSettingNameStep } from './LocalAppSettingNameStep';
import { LocalAppSettingValueStep } from './LocalAppSettingValueStep';
import { StorageTypePromptStep } from './StorageTypePromptStep';
import { CosmosDBConnectionCreateStep } from './cosmosDB/CosmosDBConnectionCreateStep';
import { CosmosDBListStep } from './cosmosDB/CosmosDBListStep';
import { EventHubAuthRuleListStep } from './eventHub/EventHubAuthRuleListStep';
import { EventHubConnectionCreateStep } from './eventHub/EventHubConnectionCreateStep';
import { EventHubListStep } from './eventHub/EventHubListStep';
import { ServiceBusConnectionCreateStep } from './serviceBus/ServiceBusConnectionCreateStep';
import { ServiceBusListStep } from './serviceBus/ServiceBusListStep';


const showHiddenValuesItem = { label: localize('showHiddenValues', '$(eye) Show hidden values'), data: 'hiddenValues' }
const hideHiddenValuesItem = { label: localize('hideHiddenValues', '$(eye-closed) Hide hidden values'), data: 'hiddenValues' }
export class LocalAppSettingListStep extends BindingSettingStepBase {
    private _showHiddenValues: boolean = false;
    public async promptCore(context: IFunctionWizardContext): Promise<BindingSettingValue> {
        const localSettingsPath: string = path.join(context.projectPath, localSettingsFileName);
        const settings: ILocalSettingsJson = await getLocalSettingsJson(context, localSettingsPath);
        const existingSettings: [string, string][] = settings.Values ? Object.entries(settings.Values) : [];

        let result: string | undefined;
        const placeHolder: string = localize('selectAppSetting', 'Select the app setting with your {1} string from "{0}"', localSettingsFileName, this._setting.label);
        do {
            let picks: IAzureQuickPickItem<string | undefined>[] = [{ label: localize('newAppSetting', '$(plus) Create new local app setting'), data: undefined }];
            picks = picks.concat(existingSettings.map((s: [string, string]) => { return { data: s[0], label: s[0], description: this._showHiddenValues ? s[1] : '******' }; }));
            if (picks.length > 1) {
                // don't add hidden values item if there are no existing settings
                picks.push(this._showHiddenValues ? hideHiddenValuesItem : showHiddenValuesItem);
            }
            result = (await context.ui.showQuickPick(picks, { placeHolder })).data;
            if (result === 'hiddenValues') {
                this._showHiddenValues = !this._showHiddenValues;
                picks.pop();
            } else {
                return result;
            }
        } while (true);
    }

    public async getSubWizard(context: IFunctionWizardContext): Promise<IWizardOptions<IFunctionWizardContext & FunctionV2WizardContext> | undefined> {
        if (!getBindingSetting(context, this._setting)) {
            const azurePromptSteps: AzureWizardPromptStep<IFunctionWizardContext & ISubscriptionActionContext & IEventHubsConnectionWizardContext>[] = [];
            const azureExecuteSteps: AzureWizardExecuteStep<IFunctionWizardContext & ISubscriptionActionContext & IEventHubsConnectionWizardContext>[] = [];
            switch (this._resourceType) {
                case ResourceType.DocumentDB:
                    azurePromptSteps.push(new CosmosDBListStep());
                    azureExecuteSteps.push(new CosmosDBConnectionCreateStep(this._setting));
                    break;
                case ResourceType.Storage:
                    azurePromptSteps.push(new StorageTypePromptStep(this._setting));
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
