/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocationListStep, VerifyProvidersStep, type ILocationWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, createSubscriptionContext, subscriptionExperience, type AzureWizardExecuteStep, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { ConnectionType, EventHubsNamespaceResourceType, EventHubsProvider, } from '../../../../constants';
import { useEmulator } from '../../../../constants-nls';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { EventHubSetSettingStep } from './EventHubSetSettingStep';
import { EventHubsNamespaceSetSettingStep } from './EventHubsNamespaceSetSettingStep';
import { type INetheriteAzureConnectionWizardContext, type INetheriteConnectionWizardContext } from './INetheriteConnectionWizardContext';
import { EventHubGetConnectionStep } from './azure/EventHubGetConnectionStep';
import { EventHubListStep } from './azure/EventHubListStep';
import { EventHubsNamespaceAuthRuleListStep } from './azure/EventHubsNamespaceAuthRuleListStep';
import { EventHubsNamespaceGetConnectionStep } from './azure/EventHubsNamespaceGetConnectionStep';
import { EventHubsNamespaceListStep } from './azure/EventHubsNamespaceListStep';
import { NetheriteEmulatorGetConnectionStep } from './emulator/NetheriteEmulatorGetConnectionStep';
import { NetheriteHostEventHubNameStep } from './emulator/NetheriteHostEventHubNameStep';

export class EventHubsConnectionListStep<T extends INetheriteConnectionWizardContext> extends AzureWizardPromptStep<T> {
    constructor(readonly connectionTypes: Set<Exclude<ConnectionType, 'Custom'>>) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const connectAzureButton = { title: localize('connectEventHubsNamespace', 'Connect Azure Event Hubs Namespace'), data: ConnectionType.Azure };
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

        const message: string = localize('selectEventHubsNamespace', 'Durable Functions requires an event hubs namespace to be configured.');
        context.eventHubsConnectionType = (await context.ui.showWarningMessage(message, { modal: true }, ...buttons) as {
            title: string;
            data: Exclude<ConnectionType, 'Custom'>;
        }).data;
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHubsConnectionType;
    }

    public async getSubWizard(context: T | INetheriteAzureConnectionWizardContext): Promise<IWizardOptions<T | INetheriteAzureConnectionWizardContext> | undefined> {
        const promptSteps: AzureWizardPromptStep<T | INetheriteAzureConnectionWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<T | INetheriteAzureConnectionWizardContext>[] = [];

        context.telemetry.properties.eventHubsConnectionType = context.eventHubsConnectionType;

        switch (context.eventHubsConnectionType) {
            case ConnectionType.Azure:
                const azureContext = context as INetheriteAzureConnectionWizardContext;
                if (!azureContext.subscriptionId) {
                    Object.assign(azureContext, createSubscriptionContext(await subscriptionExperience(azureContext, ext.rgApiV2.resources.azureResourceTreeDataProvider)));
                }

                // Make sure this is added ahead of time because location might get prompted during `ResourceGroupListStep`
                LocationListStep.addProviderForFiltering(azureContext as unknown as ILocationWizardContext, EventHubsProvider, EventHubsNamespaceResourceType);

                promptSteps.push(
                    new EventHubsNamespaceListStep(),
                    new EventHubsNamespaceAuthRuleListStep(),
                    new EventHubListStep(),
                );

                executeSteps.push(
                    new VerifyProvidersStep<INetheriteAzureConnectionWizardContext>([EventHubsProvider]),
                    new EventHubsNamespaceGetConnectionStep(),
                    new EventHubGetConnectionStep(),
                );
                break;
            case ConnectionType.Emulator:
                promptSteps.push(new NetheriteHostEventHubNameStep());
                executeSteps.push(new NetheriteEmulatorGetConnectionStep());
                break;
            default:
                return undefined;
        }

        executeSteps.push(
            new EventHubsNamespaceSetSettingStep(),
            new EventHubSetSettingStep(),
        );

        return { promptSteps, executeSteps };
    }
}
