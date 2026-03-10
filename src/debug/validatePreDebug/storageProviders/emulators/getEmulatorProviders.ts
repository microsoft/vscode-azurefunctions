/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageProviderType } from '../../../../constants';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';
import { type ILocalEmulatorProvider } from './LocalEmulatorProvidersStep';
import { createDTSEmulatorProvider } from './dtsEmulatorProvider';
import { createStorageEmulatorProvider } from './storageEmulatorProvider';

export function getEmulatorProviders<T extends IPreDebugValidateContext>(context: T): ILocalEmulatorProvider<T>[] {
    const providers: ILocalEmulatorProvider<T>[] = [];

    switch (context.durableStorageType) {
        case StorageProviderType.DTS:
            providers.push(createDTSEmulatorProvider());
            break;
        case StorageProviderType.Netherite:
        case StorageProviderType.SQL:
        case StorageProviderType.Storage:
        default:
    }

    providers.push(createStorageEmulatorProvider());
    return providers;
}
