/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardExecuteStep, type AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { EventHubSetSettingStep } from '../../../../commands/appSettings/connectionSettings/netherite/EventHubSetSettingStep';
import { EventHubsNamespaceSetSettingStep } from '../../../../commands/appSettings/connectionSettings/netherite/EventHubsNamespaceSetSettingStep';
import { NetheriteEmulatorGetConnectionStep } from '../../../../commands/appSettings/connectionSettings/netherite/emulator/NetheriteEmulatorGetConnectionStep';
import { NetheriteHostEventHubNameStep } from '../../../../commands/appSettings/connectionSettings/netherite/emulator/NetheriteHostEventHubNameStep';
import { getNetheriteLocalSettingsValues, getNetheriteSettingsKeys } from '../../../../commands/appSettings/connectionSettings/netherite/getNetheriteLocalProjectConnections';
import { localEventHubsEmulatorConnectionRegExp } from '../../../../constants';
import { localize } from '../../../../localize';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';
import { type EmulatorStatus, type IEmulatorProvider } from './IEmulatorProvider';

export class NetheriteEmulatorProvider<T extends IPreDebugValidateContext> implements IEmulatorProvider<T> {
    public readonly name: string = localize('eventHubsEmulator', 'Netherite Emulator');
    public readonly includeInSharedPrompt: boolean = true;

    public async checkEmulatorStatus(context: T): Promise<EmulatorStatus> {
        const { eventHubsNamespaceConnectionKey, eventHubConnectionKey } = await getNetheriteSettingsKeys(context) ?? {};
        const {
            eventHubsNamespaceConnectionValue,
            eventHubConnectionValue,
        } = await getNetheriteLocalSettingsValues(context, { eventHubsNamespaceConnectionKey, eventHubConnectionKey }) ?? {};

        const needsConnectionSetup = !eventHubsNamespaceConnectionValue || !eventHubConnectionValue;

        if (!eventHubsNamespaceConnectionValue) {
            // No connection at all — need everything
            return { isEmulatorRequired: true, isEmulatorRunning: false, needsConnectionSetup: true };
        }

        if (localEventHubsEmulatorConnectionRegExp.test(eventHubsNamespaceConnectionValue)) {
            // Has emulator connection string
            return { isEmulatorRequired: true, isEmulatorRunning: false, needsConnectionSetup };
        }

        // Non-emulator connection (e.g. Azure) — nothing to do
        return { isEmulatorRequired: false, isEmulatorRunning: false, needsConnectionSetup };
    }

    public getPromptSteps(status: EmulatorStatus): AzureWizardPromptStep<T>[] {
        if (status.needsConnectionSetup) {
            return [new NetheriteHostEventHubNameStep()];
        }
        return [];
    }

    public getExecuteSteps(status: EmulatorStatus): AzureWizardExecuteStep<T>[] {
        const steps: AzureWizardExecuteStep<T>[] = [];

        if (status.needsConnectionSetup) {
            steps.push(
                new NetheriteEmulatorGetConnectionStep(),
                new EventHubsNamespaceSetSettingStep(),
                new EventHubSetSettingStep(),
            );
        }

        return steps;
    }
}
