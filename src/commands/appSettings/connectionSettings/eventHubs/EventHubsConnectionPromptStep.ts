/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, ISubscriptionActionContext, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { MessageItem } from 'vscode';
import { ConnectionKey, ConnectionType, localEventHubsEmulatorConnectionRegExp } from '../../../../constants';
import { useEmulator } from '../../../../constants-nls';
import { ext } from '../../../../extensionVariables';
import { getLocalConnectionString } from '../../../../funcConfig/local.settings';
import { localize } from '../../../../localize';
import { EventHubsNamespaceListStep } from '../../../createFunction/durableSteps/netherite/EventHubsNamespaceListStep';
import { IConnectionPromptOptions } from '../IConnectionPromptOptions';
import { IEventHubsConnectionWizardContext } from './IEventHubsConnectionWizardContext';

export class EventHubsConnectionPromptStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public constructor(private readonly _options?: IConnectionPromptOptions) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const connectEventNamespaceButton: MessageItem = { title: localize('connectEventHubsNamespace', 'Connect Event Hub Namespace') };
        const useEmulatorButton: MessageItem = { title: useEmulator };

        const message: string = localize('selectEventHubsNamespace', 'In order to proceed, you must connect an event hub namespace for internal use by the Azure Functions runtime.');

        const buttons: MessageItem[] = [connectEventNamespaceButton, useEmulatorButton];

        const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true }, ...buttons);
        if (result === connectEventNamespaceButton) {
            context.eventHubConnectionType = ConnectionType.Azure;
        } else {
            // 'NonAzure' will represent 'Emulator' in this flow
            context.eventHubConnectionType = ConnectionType.NonAzure;
        }

        context.telemetry.properties.eventHubConnectionType = context.eventHubConnectionType;
    }

    public shouldPrompt(context: T): boolean {
        if (this._options?.preselectedConnectionType) {
            context.eventHubConnectionType = this._options.preselectedConnectionType;
        } else if (context.azureWebJobsStorageType) {
            context.eventHubConnectionType = context.azureWebJobsStorageType;
        }

        // Even if we skip the prompting, we should still record the flow in telemetry
        if (context.eventHubConnectionType) {
            context.telemetry.properties.eventHubConnectionType = context.eventHubConnectionType;
        }

        return !context.eventHubConnectionType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T & ISubscriptionActionContext> | undefined> {
        if (context.eventHubConnectionType !== ConnectionType.Azure) {
            return undefined;
        }

        // If the user wants to connect through Azure (usually during debug) but an Azure connection is already in the local settings, just use that instead
        const eventHubConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.EventHub, context.projectPath);
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
