/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type AzureWizardExecuteStep, type ISubscriptionActionContext, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { ConnectionType } from '../../../../constants';
import { useEmulator } from '../../../../constants-nls';
import { localize } from '../../../../localize';
import { EventHubsSetSettingStep } from './EventHubsSetSettingStep';
import { type IEventHubsConnectionWizardContext } from './IEventHubsConnectionWizardContext';

export class EventHubsConnectionListStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    constructor(readonly connectionTypes: Set<Exclude<ConnectionType, 'Custom'>>) {
        super();
    }

    public async configureBeforePrompt(context: T): Promise<void> {
        // Todo: Figure out a better way to handle this
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

    public async prompt(context: T): Promise<void> {
        const connectAzureButton = { title: localize('connectEventHubsNamespace', 'Connect Azure Event Hubs Namespace'), data: ConnectionType.Azure };
        const connectEmulatorButton = { title: useEmulator, data: ConnectionType.Emulator };

        const buttons: MessageItem[] = [];
        if (this.connectionTypes.has(ConnectionType.Azure)) {
            buttons.push(connectAzureButton);
        }
        if (this.connectionTypes.has(ConnectionType.Emulator)) {
            buttons.push(connectEmulatorButton);
        }

        // Todo: This logic should be handled in validateNetheritePreDebug
        // const eventHubConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.EventHubs, context.projectPath);
        // if (!!eventHubConnection && !localEventHubsEmulatorConnectionRegExp.test(eventHubConnection)) {
        //     return undefined;
        // }

        const message: string = localize('selectEventHubsNamespace', 'In order to proceed, you must connect an event hubs namespace for internal use by the Azure Functions runtime.');
        context.eventHubsConnectionType = (await context.ui.showWarningMessage(message, { modal: true }, ...buttons) as {
            title: string;
            data: Exclude<ConnectionType, 'Custom'>;
        }).data;

        context.telemetry.properties.eventHubsConnectionType = context.eventHubsConnectionType;
    }

    public shouldPrompt(context: T): boolean {
        return !context.eventHubsConnectionType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T & ISubscriptionActionContext> | undefined> {
        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        // Todo: Handle this later - If the user wants to connect through Azure (usually during debug) but an Azure connection is already in the local settings, just use that instead

        switch (context.eventHubsConnectionType) {
            case ConnectionType.Azure:
                // Todo:
                break;
            case ConnectionType.Emulator:
                // Todo:
                break;
            default:
                throw new Error(localize('unexpectedConnectionType', 'Internal error: Unexpected event hubs connection type encountered: "{0}".', context.eventHubsConnectionType));
        }

        executeSteps.push(
            // Todo: Is there another setting we should set here too?
            new EventHubsSetSettingStep(),
        );

        return { promptSteps, executeSteps };
    }
}
