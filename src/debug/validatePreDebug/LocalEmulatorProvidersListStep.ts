/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type AzureWizardExecuteStep, type AzureWizardPromptStep as AzureWizardPromptStepType, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type MessageItem } from 'vscode';
import { localize } from '../../localize';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';
import { type EmulatorStatus, type IEmulatorProvider } from './storageProviders/emulators/IEmulatorProvider';

interface PendingProvider<T extends IPreDebugValidateContext> {
    provider: IEmulatorProvider<T>;
    status: EmulatorStatus;
}

export class LocalEmulatorProvidersListStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    public hideStepCount: boolean = true;

    private _pendingProviders: PendingProvider<T>[] = [];

    constructor(private readonly _providers: IEmulatorProvider<T>[]) {
        super();
    }

    public async configureBeforePrompt(context: T): Promise<void> {
        this._pendingProviders = [];
        for (const provider of this._providers) {
            const status = await provider.checkEmulatorStatus(context);
            if (status.isEmulatorRequired && (!status.isEmulatorRunning || status.needsConnectionSetup)) {
                this._pendingProviders.push({ provider, status });
            }
        }
    }

    public async prompt(context: T): Promise<void> {
        const globalProviders = this._pendingProviders.filter(p => p.provider.includeInSharedPrompt);

        if (globalProviders.length === 0) {
            return;
        }

        const emulatorList: string = globalProviders.map(p => p.provider.name).join(', ');

        const startButton: MessageItem = { title: localize('startEmulators', 'Start') };
        const skipButton: MessageItem = { title: localize('skipEmulators', 'Skip'), isCloseAffordance: true };

        const message: string = localize(
            'startEmulatorsPrompt',
            'The following local emulators are needed for your debug session: {0}. Would you like to start them?',
            emulatorList,
        );

        const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true }, startButton, skipButton);

        if (result === skipButton) {
            // Only remove global-prompt providers; custom-prompt providers handle their own flow
            this._pendingProviders = this._pendingProviders.filter(p => !p.provider.includeInSharedPrompt);
        }
    }

    public shouldPrompt(_context: T): boolean {
        return this._pendingProviders.some(p => p.provider.includeInSharedPrompt);
    }

    public async getSubWizard(_context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStepType<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        for (const { provider, status } of this._pendingProviders) {
            promptSteps.push(...provider.getPromptSteps(status));
            executeSteps.push(...provider.getExecuteSteps(status));
        }

        return (promptSteps.length > 0 || executeSteps.length > 0) ? { promptSteps, executeSteps } : undefined;
    }
}
