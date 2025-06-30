/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceGroupListStep, VerifyProvidersStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, type AzureWizardExecuteStep, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { CodeAction, ConnectionType, EventHubsProvider } from '../../../../constants';
import { useEmulator } from '../../../../constants-nls';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { EventHubNamespaceGetConnectionStep } from './azure/EventHubNamespaceGetConnectionStep';
import { EventHubsNamespaceListStep } from './azure/EventHubsNamespaceListStep';
import { NetheriteEmulatorGetConnectionStep } from './emulator/NetheriteEmulatorGetConnectionStep';
import { NetheriteHostEventHubNameStep } from './emulator/NetheriteHostEventHubNameStep';
import { EventHubSetSettingStep } from './EventHubSetSettingStep';
import { EventHubsNamespaceSetSettingStep } from './EventHubsNamespaceSetSettingStep';
import { type INetheriteAzureConnectionWizardContext, type INetheriteConnectionWizardContext } from './INetheriteConnectionWizardContext';

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
        if (context.action === CodeAction.Deploy) {
            buttons.push(skipForNow);
        }

        const message: string = localize('selectEventHubsNamespace', 'In order to proceed, you must connect an event hubs namespace for internal use by the Azure Functions runtime.');
        context.eventHubsConnectionType = (await context.ui.showWarningMessage(message, { modal: true }, ...buttons) as {
            title: string;
            data: Exclude<ConnectionType, 'Custom'>;
        }).data;
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHubsConnectionType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T | INetheriteAzureConnectionWizardContext> | undefined> {
        const promptSteps: AzureWizardPromptStep<T | INetheriteAzureConnectionWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<T | INetheriteAzureConnectionWizardContext>[] = [];

        context.telemetry.properties.eventHubsConnectionType = context.eventHubsConnectionType;

        switch (context.eventHubsConnectionType) {
            case ConnectionType.Azure:
                const subscriptionPromptStep = await ext.azureAccountTreeItem.getSubscriptionPromptStep(context) as AzureWizardPromptStep<INetheriteAzureConnectionWizardContext> | undefined;
                if (subscriptionPromptStep) {
                    promptSteps.push(subscriptionPromptStep);
                }

                promptSteps.push(
                    new ResourceGroupListStep() as AzureWizardPromptStep<INetheriteAzureConnectionWizardContext>,
                    new EventHubsNamespaceListStep(),
                );

                executeSteps.push(
                    new VerifyProvidersStep<INetheriteAzureConnectionWizardContext>([EventHubsProvider]),
                    new EventHubNamespaceGetConnectionStep(),
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
