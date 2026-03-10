/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type AzureWizardExecuteStep, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';

export interface ILocalEmulatorProvider<T extends IPreDebugValidateContext> {
    /** Display name for this emulator (e.g. "Azure Storage", "DTS") */
    name: string;

    /**
     * Reads the connection string from local.settings.json and determines
     * whether it corresponds to an emulator connection.
     */
    getConnectionInfo(context: T): Promise<{ connection: string | undefined; isEmulator: boolean }>;

    /** Returns whether the emulator is currently reachable */
    isEmulatorRunning(context: T, emulatorConnection: string): Promise<boolean>;

    /** Prompt steps to show when the emulator is not running (e.g. ask user to start/install) */
    providePromptSteps?(): AzureWizardPromptStep<T>[];

    /** Execute steps to start the emulator */
    provideExecuteSteps(): AzureWizardExecuteStep<T>[];
}

export class LocalEmulatorProvidersStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    private _emulatorsToStart: ILocalEmulatorProvider<T>[] = [];
    private readonly _emulatorProviders: ILocalEmulatorProvider<T>[];

    constructor(providers: ILocalEmulatorProvider<T>[]) {
        super();
        this._emulatorProviders = providers;
    }

    /**
     * For each registered provider, check if the connection string
     * is an emulator and whether the emulator is reachable.
     */
    public async configureBeforePrompt(context: T): Promise<void> {
        this._emulatorsToStart = [];

        for (const provider of this._emulatorProviders) {
            const { connection, isEmulator } = await provider.getConnectionInfo(context);

            if (connection && !isEmulator) {
                continue;
            }

            if (connection && await provider.isEmulatorRunning(context, connection)) {
                continue;
            }

            this._emulatorsToStart.push(provider);
        }
    }

    public async prompt(): Promise<void> {
        // Skip straight to subwizard
    }

    public shouldPrompt(): boolean {
        // Skip straight to subwizard
        return false;
    }

    public async getSubWizard(): Promise<IWizardOptions<T> | undefined> {
        if (!this._emulatorsToStart.length) {
            return undefined;
        }

        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        for (const emulatorProvider of this._emulatorsToStart) {
            if (emulatorProvider.providePromptSteps) {
                promptSteps.push(...emulatorProvider.providePromptSteps());
            }
            if (emulatorProvider.provideExecuteSteps) {
                executeSteps.push(...emulatorProvider.provideExecuteSteps());
            }
        }

        return { promptSteps, executeSteps };
    }
}
