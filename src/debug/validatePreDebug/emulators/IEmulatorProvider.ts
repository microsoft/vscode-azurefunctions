/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardExecuteStep, type AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { type IPreDebugValidateContext } from '../IPreDebugValidateContext';

export interface EmulatorStatus {
    /** Whether this project is configured for or needs an emulator */
    readonly isEmulatorRequired: boolean;
    /** Whether the emulator process is currently running */
    readonly isEmulatorRunning?: boolean;
    /** Whether the connection string needs to be written or reset in local.settings.json */
    readonly needsConnectionSetup?: boolean;
}

export interface IEmulatorProvider<T extends IPreDebugValidateContext> {
    readonly name: string;
    /**
     * When true, asks the user if they want to start this emulator through the shared prompt in `LocalEmulatorProvidersListStep`.
     * When false or unset, the provider assumes responsibility for any custom prompting.
     */
    readonly includeInSharedPrompt?: boolean;

    checkEmulatorStatus(context: T): Promise<EmulatorStatus>;
    getPromptSteps(status: EmulatorStatus): AzureWizardPromptStep<T>[];
    getExecuteSteps(status: EmulatorStatus): AzureWizardExecuteStep<T>[];
}
