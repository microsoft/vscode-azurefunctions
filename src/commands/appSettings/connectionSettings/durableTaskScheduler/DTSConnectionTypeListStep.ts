/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VerifyProvidersStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, type AzureWizardExecuteStep, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { ConnectionType, DurableTaskProvider } from '../../../../constants';
import { useEmulator } from '../../../../constants-nls';
import { localize } from '../../../../localize';
import { HttpDurableTaskSchedulerClient } from '../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient';
import { DurableTaskHubListStep } from './azure/DurableTaskHubListStep';
import { DurableTaskSchedulerListStep } from './azure/DurableTaskSchedulerListStep';
import { DTSConnectionCustomPromptStep } from './custom/DTSConnectionCustomPromptStep';
import { DTSHubNameCustomPromptStep } from './custom/DTSHubNameCustomPromptStep';
import { DTSConnectionSetSettingStep } from './DTSConnectionSetSettingStep';
import { DTSHubNameSetSettingStep } from './DTSHubNameSetSettingStep';
import { DTSEmulatorStartStep } from './emulator/DTSEmulatorStartStep';
import { type IDTSAzureConnectionWizardContext, type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSConnectionTypeListStep<T extends IDTSConnectionWizardContext> extends AzureWizardPromptStep<T> {
    constructor(readonly connectionTypes: Set<ConnectionType>) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const connectAzureButton = { title: localize('connectAzureTaskScheduler', 'Connect Azure Task Scheduler'), data: ConnectionType.Azure };
        const connectEmulatorButton = { title: useEmulator, data: ConnectionType.Emulator };
        const connectCustomDTSButton = { title: localize('connectCustomTaskScheduler', 'Connect Custom Task Scheduler'), data: ConnectionType.Custom };

        const buttons: MessageItem[] = [];
        if (this.connectionTypes.has(ConnectionType.Azure)) {
            buttons.push(connectAzureButton);
        }
        if (this.connectionTypes.has(ConnectionType.Emulator)) {
            buttons.push(connectEmulatorButton);
        }
        if (this.connectionTypes.has(ConnectionType.Custom)) {
            buttons.push(connectCustomDTSButton);
        }

        const message: string = localize('selectDTSConnection', 'In order to proceed, you must connect a Durable Task Scheduler for internal use by the Azure Functions runtime.');
        context.dtsConnectionType = (await context.ui.showWarningMessage(message, { modal: true }, ...buttons) as {
            title: string;
            data: ConnectionType;
        }).data;

        context.telemetry.properties.dtsConnectionType = context.dtsConnectionType;
    }

    public shouldPrompt(context: T): boolean {
        return !context.dtsConnectionType;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T | IDTSAzureConnectionWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<T | IDTSAzureConnectionWizardContext>[] = [];

        switch (context.dtsConnectionType) {
            case ConnectionType.Azure:
                const client = new HttpDurableTaskSchedulerClient();
                promptSteps.push(
                    new DurableTaskSchedulerListStep(client),
                    new DurableTaskHubListStep(client)
                );
                executeSteps.push(new VerifyProvidersStep<IDTSAzureConnectionWizardContext>([DurableTaskProvider]));
                break;
            case ConnectionType.Emulator:
                executeSteps.push(new DTSEmulatorStartStep());
                break;
            case ConnectionType.Custom:
                promptSteps.push(
                    new DTSConnectionCustomPromptStep(),
                    new DTSHubNameCustomPromptStep(),
                );
                break;
        }

        executeSteps.push(
            new DTSConnectionSetSettingStep(),
            new DTSHubNameSetSettingStep(),
        );

        return { promptSteps, executeSteps };
    }
}
