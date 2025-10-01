/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { StorageProviderType } from '../../../../constants';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';

export class LocalEmulatorsListStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    private _emulatorsToStart: StorageProviderType[] = [];

    public async prompt(context: T): Promise<void> {
        // Maybe this first part should be configureBeforePrompt
        this._emulatorsToStart = [];

        switch (context.durableStorageType) {
            case StorageProviderType.DTS:
                this._emulatorsToStart.push(StorageProviderType.DTS);
                // Todo: Verify if emulator needs starting
                break;
            case StorageProviderType.Netherite:
                this._emulatorsToStart.push(StorageProviderType.Netherite);
                // Todo: Verify if emulator needs starting
                break;
            case StorageProviderType.SQL:
                // Todo: Add SQL emulator support
                break;
            case StorageProviderType.Storage:
            default:
        }

        this._emulatorsToStart.push(StorageProviderType.Storage);
        // Todo: Verify if emulator needs starting
    }

    public shouldPrompt(): boolean {
        return true;
    }
}
