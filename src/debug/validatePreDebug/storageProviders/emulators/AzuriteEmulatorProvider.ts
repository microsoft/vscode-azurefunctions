/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BlobServiceClient } from '@azure/storage-blob';
import { type AzureWizardExecuteStep, type AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { AzuriteEmulatorStartStep } from '../../../../commands/appSettings/connectionSettings/azureWebJobsStorage/emulator/AzuriteEmulatorStartStep';
import { StorageEmulatorGetConnectionStep } from '../../../../commands/appSettings/connectionSettings/azureWebJobsStorage/emulator/StorageEmulatorGetConnectionStep';
import { StorageConnectionSetSettingStep } from '../../../../commands/appSettings/connectionSettings/azureWebJobsStorage/StorageConnectionSetSettingStep';
import { ConnectionKey, ConnectionType, localStorageEmulatorConnectionString } from '../../../../constants';
import { getLocalSettingsConnectionString } from '../../../../funcConfig/local.settings';
import { localize } from '../../../../localize';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';
import { type EmulatorStatus, type IEmulatorProvider } from './IEmulatorProvider';

export class AzuriteEmulatorProvider<T extends IPreDebugValidateContext> implements IEmulatorProvider<T> {
    public readonly name: string = localize('azuriteEmulator', 'Azurite');
    public readonly includeInSharedPrompt: boolean = true;

    public async checkEmulatorStatus(context: T): Promise<EmulatorStatus> {
        const [connectionString, isEmulator] = await getLocalSettingsConnectionString(context, ConnectionKey.Storage, context.projectPath);

        // User explicitly chose not to hook up an emulator
        if (context.azureWebJobsStorageType !== ConnectionType.Emulator) {
            return { isEmulatorRequired: false };
        }

        // Has an existing connection string — check if the emulator is reachable
        if (connectionString && isEmulator) {
            return { isEmulatorRequired: true, isEmulatorRunning: await this.checkAzuriteRunning(connectionString), needsConnectionSetup: false };
        }

        // No emulator connection string set — still probe the default emulator endpoint in case it's already running
        return { isEmulatorRequired: true, isEmulatorRunning: await this.checkAzuriteRunning(localStorageEmulatorConnectionString), needsConnectionSetup: true };
    }

    public getPromptSteps(_status: EmulatorStatus): AzureWizardPromptStep<T>[] {
        return [];
    }

    public getExecuteSteps(status: EmulatorStatus): AzureWizardExecuteStep<T>[] {
        const steps: AzureWizardExecuteStep<T>[] = [];

        // Start the Azurite emulator if it's not already running
        if (!status.isEmulatorRunning) {
            steps.push(new AzuriteEmulatorStartStep() as unknown as AzureWizardExecuteStep<T>);
        }

        // Set the emulator connection string if it's missing or needs to be reset
        if (status.needsConnectionSetup) {
            steps.push(
                new StorageEmulatorGetConnectionStep() as unknown as AzureWizardExecuteStep<T>,
                new StorageConnectionSetSettingStep(),
            );
        }

        return steps;
    }

    /**
     * Pings the Azurite blob service to check if the emulator is actually running.
     */
    private async checkAzuriteRunning(connectionString: string): Promise<boolean> {
        try {
            const client = BlobServiceClient.fromConnectionString(connectionString, { retryOptions: { maxTries: 1 } });
            await client.getProperties();
            return true;
        } catch {
            return false;
        }
    }
}
