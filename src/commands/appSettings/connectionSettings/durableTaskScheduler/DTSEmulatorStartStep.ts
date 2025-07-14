/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullValue } from '@microsoft/vscode-azext-utils';
import { commands, window } from 'vscode';
import { ConnectionType } from '../../../../constants';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { type DurableTaskSchedulerEmulator } from '../../../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient';
import { type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSEmulatorStartStep<T extends IDTSConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 200;

    public async execute(context: T): Promise<void> {
        const emulatorId: string = nonNullValue(
            await commands.executeCommand('azureFunctions.durableTaskScheduler.startEmulator'),
            localize('failedToStartEmulator', 'Internal error: Failed to start DTS emulator.'),
        );

        const emulators: DurableTaskSchedulerEmulator[] = nonNullValue(
            await commands.executeCommand('azureFunctions.durableTaskScheduler.getEmulators'),
            localize('failedToGetEmulators', 'Internal error: Failed to retrieve the list of DTS emulators.'),
        );

        const emulator: DurableTaskSchedulerEmulator = nonNullValue(
            emulators.find(e => e.id === emulatorId),
            localize('couldNotFindEmulator', 'Internal error: Failed to retrieve info on the started DTS emulator.'),
        );

        const { schedulerEndpoint, dashboardEndpoint } = emulator;

        const message: string = localize('emulatorStartedMessage', `Durable Task Scheduler (DTS) emulator has been started by your container client at "{0}".  Its dashboard is available at "{1}".`, schedulerEndpoint.toString(), dashboardEndpoint.toString());
        void window.showInformationMessage(message);
        ext.outputChannel.appendLog(message);

        context.newDTSConnection = `Endpoint=${emulator.schedulerEndpoint};Authentication=None`;
        context.newDTSHubName = 'default';
    }

    public shouldExecute(context: T): boolean {
        return !context.newDTSConnection && context.dtsConnectionType === ConnectionType.Emulator;
    }
}
