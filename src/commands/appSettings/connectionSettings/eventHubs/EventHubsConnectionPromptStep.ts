/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type ISubscriptionActionContext, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { ConnectionKey, ConnectionType, localEventHubsEmulatorConnectionRegExp } from '../../../../constants';
import { useEmulator } from '../../../../constants-nls';
import { ext } from '../../../../extensionVariables';
import { getLocalSettingsConnectionString } from '../../../../funcConfig/local.settings';
import { localize } from '../../../../localize';
import { EventHubsNamespaceListStep } from '../../../createFunction/durableSteps/netherite/EventHubsNamespaceListStep';
import { type IConnectionPromptOptions } from '../IConnectionPromptOptions';
import { type IEventHubsConnectionWizardContext } from './IEventHubsConnectionWizardContext';

export class EventHubsConnectionPromptStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public constructor(private readonly options?: IConnectionPromptOptions) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const connectEventNamespaceButton: MessageItem = { title: localize('connectEventHubsNamespace', 'Connect Event Hubs Namespace') };
        const useEmulatorButton: MessageItem = { title: useEmulator };

        const message: string = localize('selectEventHubsNamespace', 'In order to proceed, you must connect an event hubs namespace for internal use by the Azure Functions runtime.');

        const buttons: MessageItem[] = [connectEventNamespaceButton, useEmulatorButton];

        const eventHubConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.EventHubs, context.projectPath);
        if (!!eventHubConnection && !localEventHubsEmulatorConnectionRegExp.test(eventHubConnection)) {
            return undefined;
        }

        const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true }, ...buttons);
        if (result === connectEventNamespaceButton) {
            context.eventHubsConnectionType = ConnectionType.Azure;
        } else {
            context.eventHubsConnectionType = ConnectionType.Emulator;
        }

        context.telemetry.properties.eventHubsConnectionType = context.eventHubsConnectionType;
    }

    public async configureBeforePrompt(context: T): Promise<void> {
        if (this.options?.preselectedConnectionType === ConnectionType.Azure || this.options?.preselectedConnectionType === ConnectionType.Emulator) {
            context.eventHubsConnectionType = this.options.preselectedConnectionType;
        } else if (context.azureWebJobsStorageType) {
            context.eventHubsConnectionType = context.azureWebJobsStorageType;
        }

        // Even if we skip the prompting, we should still record the flow in telemetry
        if (context.eventHubsConnectionType) {
            context.telemetry.properties.eventHubsConnectionType = context.eventHubsConnectionType;
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHubsConnectionType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T & ISubscriptionActionContext> | undefined> {
        if (context.eventHubsConnectionType !== ConnectionType.Azure) {
            return undefined;
        }

        // If the user wants to connect through Azure (usually during debug) but an Azure connection is already in the local settings, just use that instead
        const eventHubConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.EventHubs, context.projectPath);
        if (!!eventHubConnection && !localEventHubsEmulatorConnectionRegExp.test(eventHubConnection)) {
            return undefined;
        }

        const promptSteps: AzureWizardPromptStep<T & ISubscriptionActionContext>[] = [];

        const subscriptionPromptStep: AzureWizardPromptStep<ISubscriptionActionContext> | undefined = await ext.azureAccountTreeItem.getSubscriptionPromptStep(context);
        if (subscriptionPromptStep) {
            promptSteps.push(subscriptionPromptStep);
        }

        promptSteps.push(new EventHubsNamespaceListStep());

        return { promptSteps };
    }
}
