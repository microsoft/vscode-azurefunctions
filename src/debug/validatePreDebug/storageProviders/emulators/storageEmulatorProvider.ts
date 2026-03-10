/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BlobServiceClient } from '@azure/storage-blob';
import { ConnectionKey, localStorageEmulatorConnectionString } from '../../../../constants';
import { getLocalSettingsConnectionString } from '../../../../funcConfig/local.settings';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';
import { type ILocalEmulatorProvider } from './LocalEmulatorProvidersStep';
import { StorageEmulatorPromptStep } from './StorageEmulatorPromptStep';
import { StorageEmulatorStartStep } from './StorageEmulatorStartStep';

export function createStorageEmulatorProvider<T extends IPreDebugValidateContext>(): ILocalEmulatorProvider<T> {
    return {
        name: 'Azure Storage',

        async getConnectionInfo(context: T) {
            const storageIdentityConnection: string | undefined = (await getLocalSettingsConnectionString(context, ConnectionKey.StorageIdentity, context.projectPath))[0];
            if (storageIdentityConnection) {
                return { connection: undefined, isEmulator: false };
            }

            const [connectionString, isEmulator] = await getLocalSettingsConnectionString(context, ConnectionKey.Storage, context.projectPath);

            // Empty connection string is treated as emulator (default local dev experience)
            if (!connectionString) {
                return { connection: localStorageEmulatorConnectionString, isEmulator: true };
            }

            return { connection: connectionString, isEmulator };
        },

        async isEmulatorRunning(_context: T, connection: string) {
            try {
                const client = BlobServiceClient.fromConnectionString(connection, { retryOptions: { maxTries: 1 } });
                await client.getProperties();
                return true;
            } catch {
                return false;
            }
        },

        providePromptSteps() {
            return [new StorageEmulatorPromptStep()];
        },

        provideExecuteSteps() {
            return [new StorageEmulatorStartStep()];
        },
    };
}
