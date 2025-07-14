/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocationListStep, ResourceGroupListStep, VerifyProvidersStep, type ILocationWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, createSubscriptionContext, subscriptionExperience, type AzureWizardExecuteStep, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { ConnectionType, DurableTaskProvider, DurableTaskSchedulersResourceType } from '../../../../constants';
import { useEmulator } from '../../../../constants-nls';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { DurableTaskSchedulerGetConnectionStep } from './azure/DurableTaskSchedulerGetConnectionStep';
import { DurableTaskSchedulerListStep } from './azure/DurableTaskSchedulerListStep';
import { DTSConnectionCustomPromptStep } from './custom/DTSConnectionCustomPromptStep';
import { DTSHubNameCustomPromptStep } from './custom/DTSHubNameCustomPromptStep';
import { DTSConnectionSetSettingStep } from './DTSConnectionSetSettingStep';
import { DTSHubNameSetSettingStep } from './DTSHubNameSetSettingStep';
import { DTSEmulatorGetConnectionsStep } from './emulator/DTSEmulatorGetConnectionsStep';
import { DTSEmulatorStartStep } from './emulator/DTSEmulatorStartStep';
import { type IDTSAzureConnectionWizardContext, type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSConnectionListStep<T extends IDTSConnectionWizardContext> extends AzureWizardPromptStep<T> {
    constructor(readonly connectionTypes: Set<ConnectionType>) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const connectAzureButton = { title: localize('connectAzureTaskScheduler', 'Connect Azure Task Scheduler'), data: ConnectionType.Azure };
        const connectEmulatorButton = { title: useEmulator, data: ConnectionType.Emulator };
        const connectCustomDTSButton = { title: localize('connectCustomTaskScheduler', 'Manually Set a Connection String'), data: ConnectionType.Custom };
        const skipForNow = { title: localize('skipForNow', 'Skip for now'), data: undefined };

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

        buttons.push(skipForNow);

        const message: string = localize('selectDTSConnection', 'Durable Functions needs to be configured to use a Durable Task Scheduler.');
        context.dtsConnectionType = (await context.ui.showWarningMessage(message, { modal: true }, ...buttons) as {
            title: string;
            data: ConnectionType;
        }).data;
    }

    public shouldPrompt(context: T): boolean {
        return !context.dtsConnectionType;
    }

    public async getSubWizard(context: T | IDTSAzureConnectionWizardContext): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T | IDTSAzureConnectionWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<T | IDTSAzureConnectionWizardContext>[] = [];

        context.telemetry.properties.dtsConnectionType = context.dtsConnectionType;

        switch (context.dtsConnectionType) {
            case ConnectionType.Azure:
                if (!(context as IDTSAzureConnectionWizardContext).subscriptionId) {
                    Object.assign(context, createSubscriptionContext(await subscriptionExperience(context, ext.rgApiV2.resources.azureResourceTreeDataProvider)));
                }

                LocationListStep.addProviderForFiltering(context as unknown as ILocationWizardContext, DurableTaskProvider, DurableTaskSchedulersResourceType);

                promptSteps.push(
                    new ResourceGroupListStep() as AzureWizardPromptStep<IDTSAzureConnectionWizardContext>,
                    new DurableTaskSchedulerListStep(),
                );
                executeSteps.push(
                    new VerifyProvidersStep<IDTSAzureConnectionWizardContext>([DurableTaskProvider]),
                    new DurableTaskSchedulerGetConnectionStep(),
                );
                break;
            case ConnectionType.Emulator:
                executeSteps.push(
                    new DTSEmulatorStartStep(),
                    new DTSEmulatorGetConnectionsStep(),
                );
                break;
            case ConnectionType.Custom:
                promptSteps.push(
                    new DTSConnectionCustomPromptStep(),
                    new DTSHubNameCustomPromptStep(),
                );
                break;
            default:
                return undefined;
        }

        executeSteps.push(
            new DTSConnectionSetSettingStep(),
            new DTSHubNameSetSettingStep(),
        );

        return { promptSteps, executeSteps };
    }
}
