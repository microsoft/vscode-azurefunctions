/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput, nonNullValue } from '@microsoft/vscode-azext-utils';
import { commands, window } from 'vscode';
import { getDTSSettingsKeys } from '../../../../commands/appSettings/connectionSettings/durableTaskScheduler/getDTSLocalProjectConnections';
import { setLocalSetting } from '../../../../commands/appSettings/connectionSettings/setConnectionSetting';
import { getSchedulerConnectionString, SchedulerAuthenticationType } from '../../../../commands/durableTaskScheduler/copySchedulerConnectionString';
import { ConnectionKey } from '../../../../constants';
import { ext } from '../../../../extensionVariables';
import { localize } from '../../../../localize';
import { type DurableTaskSchedulerEmulator } from '../../../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';

export class DTSEmulatorStartStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 220;
    public stepName: string = 'dtsEmulatorStartStep';

    protected getTreeItemLabel = () => localize('dtsEmulatorStartLabel', 'DTS emulator (container)');
    protected getOutputLogSuccess = () => localize('dtsEmulatorStartSuccess', 'Successfully started the DTS emulator.');
    protected getOutputLogFail = () => localize('dtsEmulatorStartFail', 'Failed to start the DTS emulator.');

    public async execute(context: T): Promise<void> {
        // Start the emulator and retrieve its info
        const emulatorId: string = nonNullValue(
            await commands.executeCommand('azureFunctions.durableTaskScheduler.startEmulator'),
            localize('failedToStartEmulator', 'Internal error: Failed to start DTS emulator.'),
        );

        const emulators: DurableTaskSchedulerEmulator[] = nonNullValue(
            await commands.executeCommand('azureFunctions.durableTaskScheduler.getEmulators'),
            localize('failedToGetEmulators', 'Internal error: Failed to retrieve the list of DTS emulators.'),
        );

        const emulator = nonNullValue(
            emulators.find(e => e.id === emulatorId),
            localize('couldNotFindEmulator', 'Internal error: Failed to retrieve info on the started DTS emulator.'),
        );

        // Derive the connection string and write it to local.settings.json
        const connectionString = getSchedulerConnectionString(emulator.schedulerEndpoint.toString(), SchedulerAuthenticationType.None);
        const { dtsConnectionKey } = await getDTSSettingsKeys(context) ?? {};
        await setLocalSetting(context, dtsConnectionKey ?? ConnectionKey.DTS, connectionString);
        await setLocalSetting(context, 'TASKHUB_NAME', 'default');

        const { schedulerEndpoint, dashboardEndpoint } = emulator;
        const message: string = localize('emulatorStartedMessage', 'Durable Task Scheduler (DTS) emulator has been started at "{0}". Its dashboard is available at "{1}".', schedulerEndpoint.toString(), dashboardEndpoint.toString());
        void window.showInformationMessage(message);
        ext.outputChannel.appendLog(message);
    }

    public shouldExecute(): boolean {
        return true;
    }
}
