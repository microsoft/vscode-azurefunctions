/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BlobServiceClient } from '@azure/storage-blob';
import { type AzureWizardExecuteStep, type AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { StorageConnectionSetSettingStep } from '../../../../commands/appSettings/connectionSettings/azureWebJobsStorage/StorageConnectionSetSettingStep';
import { ConnectionKey, ConnectionType, localStorageEmulatorConnectionString } from '../../../../constants';
import { getLocalSettingsConnectionString } from '../../../../funcConfig/local.settings';
import { localize } from '../../../../localize';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';
import { type EmulatorStatus, type IEmulatorProvider } from '../IEmulatorProvider';
import { StorageEmulatorGetConnectionStep } from './StorageEmulatorGetConnectionStep';
import { StorageEmulatorStartStep } from './StorageEmulatorStartStep';

export class StorageEmulatorProvider<T extends IPreDebugValidateContext> implements IEmulatorProvider<T> {
    public readonly name: string = localize('storageEmulator', 'Azurite');
    public readonly includeInSharedPrompt: boolean = true;

    public async checkEmulatorStatus(context: T): Promise<EmulatorStatus> {
        const [connectionString, isEmulator] = await getLocalSettingsConnectionString(context, ConnectionKey.Storage, context.projectPath);

        // User explicitly chose not to hook up an emulator
        if (context.azureWebJobsStorageType !== ConnectionType.Emulator) {
            return { isEmulatorRequired: false };
        }

        // User has an existing connection string; verify that the emulator is reachable
        if (connectionString && isEmulator) {
            return { isEmulatorRequired: true, isEmulatorRunning: await this.checkStorageEmulatorRunning(connectionString), needsConnectionSetup: false };
        }

        // User has no connection string, assume the default and check to see if Azurite is running
        return { isEmulatorRequired: true, isEmulatorRunning: await this.checkStorageEmulatorRunning(localStorageEmulatorConnectionString), needsConnectionSetup: true };
    }

    public getPromptSteps(_status: EmulatorStatus): AzureWizardPromptStep<T>[] {
        return [];
    }

    public getExecuteSteps(status: EmulatorStatus): AzureWizardExecuteStep<T>[] {
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        if (!status.isEmulatorRunning) {
            executeSteps.push(new StorageEmulatorStartStep());
        }

        // Set the emulator connection string if it's missing or needs to be reset
        if (status.needsConnectionSetup) {
            executeSteps.push(
                new StorageEmulatorGetConnectionStep(),
                new StorageConnectionSetSettingStep(),
            );
        }

        return executeSteps;
    }

    /**
     * Pings the Azurite blob service to check if the emulator is actually running.
     */
    private async checkStorageEmulatorRunning(connectionString: string): Promise<boolean> {
        try {
            const client = BlobServiceClient.fromConnectionString(connectionString, { retryOptions: { maxTries: 1 } });
            await client.getProperties();
            return true;
        } catch {
            return false;
        }
    }
}
