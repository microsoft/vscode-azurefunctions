/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardExecuteStep, type AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { commands } from 'vscode';
import { DTSConnectionSetSettingStep } from '../../../../commands/appSettings/connectionSettings/durableTaskScheduler/DTSConnectionSetSettingStep';
import { DTSHubNameSetSettingStep } from '../../../../commands/appSettings/connectionSettings/durableTaskScheduler/DTSHubNameSetSettingStep';
import { getDTSLocalSettingsValues, getDTSSettingsKeys } from '../../../../commands/appSettings/connectionSettings/durableTaskScheduler/getDTSLocalProjectConnections';
import { localize } from '../../../../localize';
import { type DurableTaskSchedulerEmulator } from '../../../../tree/durableTaskScheduler/DurableTaskSchedulerEmulatorClient';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';
import { isDTSEmulatorConnectionString } from '../../setConnections/setDTSConnectionPreDebug';
import { type EmulatorStatus, type IEmulatorProvider } from '../IEmulatorProvider';
import { DTSEmulatorGetConnectionsStep } from './DTSEmulatorGetConnectionsStep';
import { DTSEmulatorStartStep } from './DTSEmulatorStartStep';

export class DTSEmulatorProvider<T extends IPreDebugValidateContext> implements IEmulatorProvider<T> {
    public readonly name: string = localize('dtsEmulator', 'DTS Emulator');
    public readonly includeInSharedPrompt: boolean = true;

    public async checkEmulatorStatus(context: T): Promise<EmulatorStatus> {
        const { dtsConnectionKey, dtsHubConnectionKey } = await getDTSSettingsKeys(context) ?? {};
        const { dtsConnectionValue, dtsHubConnectionValue } = await getDTSLocalSettingsValues(context, { dtsConnectionKey, dtsHubConnectionKey }) ?? {};

        const needsConnectionSetup = !dtsConnectionValue || !dtsHubConnectionValue;

        if (!dtsConnectionValue) {
            // No connection at all — need everything
            return { isEmulatorRequired: true, isEmulatorRunning: false, needsConnectionSetup: true };
        }

        if (isDTSEmulatorConnectionString(dtsConnectionValue)) {
            // Has emulator connection string — check if running
            const isEmulatorRunning = await this.checkEmulatorRunning(context);
            return { isEmulatorRequired: true, isEmulatorRunning, needsConnectionSetup };
        }

        // Non-emulator connection (e.g. Azure or Custom) — nothing to do
        return { isEmulatorRequired: false, isEmulatorRunning: false, needsConnectionSetup };
    }

    public getPromptSteps(_status: EmulatorStatus): AzureWizardPromptStep<T>[] {
        return [];
    }

    public getExecuteSteps(status: EmulatorStatus): AzureWizardExecuteStep<T>[] {
        const steps: AzureWizardExecuteStep<T>[] = [];

        if (!status.isEmulatorRunning) {
            steps.push(new DTSEmulatorStartStep());
        }

        if (status.needsConnectionSetup) {
            steps.push(
                new DTSEmulatorGetConnectionsStep(),
                new DTSConnectionSetSettingStep(),
                new DTSHubNameSetSettingStep(),
            );
        }

        return steps;
    }

    private async checkEmulatorRunning(context: T): Promise<boolean> {
        try {
            const emulators: DurableTaskSchedulerEmulator[] | undefined =
                await commands.executeCommand('azureFunctions.durableTaskScheduler.getEmulators');
            if (emulators?.length) {
                context.dtsEmulator = emulators[0];
                return true;
            }
        } catch {
            // Unable to check — assume not running
        }

        return false;
    }
}
