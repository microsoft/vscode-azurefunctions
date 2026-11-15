/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceManagementClient } from '@azure/arm-resources';
import { AzureWizardExecuteStep, type ISubscriptionActionContext, parseError } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { DurableTaskProvider } from '../../constants';
import { localize } from '../../localize';
import { createResourcesClient } from '../../utils/azureClients';
import { delay } from '../../utils/delay';

export interface DurableTaskProviderRegisterStepOptions<T extends ISubscriptionActionContext> {
    createClient?: (context: T) => Promise<Pick<ResourceManagementClient, 'providers'>>;
    pollIntervalMs?: number;
    maxWaitMs?: number;
}

/**
 * Registers the Microsoft.DurableTask resource provider and fails the wizard if registration fails.
 *
 * Unlike `VerifyProvidersStep`, which swallows registration errors, this step throws so that the wizard
 * stops before any resources (such as a new resource group) are created.
 */
export class DurableTaskProviderRegisterStep<T extends ISubscriptionActionContext> extends AzureWizardExecuteStep<T> {
    // Must run before ResourceGroupCreateStep (priority 100)
    public priority: number = 90;

    private readonly _createClient: (context: T) => Promise<Pick<ResourceManagementClient, 'providers'>>;
    private readonly _pollIntervalMs: number;
    private readonly _maxWaitMs: number;

    constructor(options: DurableTaskProviderRegisterStepOptions<T> = {}) {
        super();
        this._createClient = options.createClient ?? createResourcesClient;
        this._pollIntervalMs = options.pollIntervalMs ?? 2 * 1000;
        // Resources can be created while the provider is still "Registering", so don't wait for it to finish
        this._maxWaitMs = options.maxWaitMs ?? 30 * 1000;
    }

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        progress.report({ message: localize('registeringDtsProvider', 'Registering resource provider "{0}"...', DurableTaskProvider) });

        let state: string | undefined;
        try {
            const client = await this._createClient(context);
            state = (await client.providers.get(DurableTaskProvider)).registrationState;
            if (isRegistered(state)) {
                return;
            }

            state = (await client.providers.register(DurableTaskProvider)).registrationState;
            const maxTime = Date.now() + this._maxWaitMs;
            while (!isRegistered(state) && Date.now() < maxTime) {
                await delay(this._pollIntervalMs);
                state = (await client.providers.get(DurableTaskProvider)).registrationState;
            }
        } catch (error) {
            throw new Error(localize(
                'dtsProviderRegisterFailed',
                'Failed to register resource provider "{0}" for subscription "{1}": {2}',
                DurableTaskProvider,
                context.subscriptionDisplayName,
                parseError(error).message), { cause: error });
        }

        if (!isRegistered(state) && !isRegistering(state)) {
            throw new Error(localize(
                'dtsProviderNotRegistered',
                'Resource provider "{0}" is not registered for subscription "{1}" (state: "{2}"). Register the provider and try again.',
                DurableTaskProvider,
                context.subscriptionDisplayName,
                state ?? 'Unknown'));
        }
    }

    public shouldExecute(): boolean {
        return true;
    }
}

function isRegistered(state: string | undefined): boolean {
    return state?.toLowerCase() === 'registered';
}

function isRegistering(state: string | undefined): boolean {
    return state?.toLowerCase() === 'registering';
}
