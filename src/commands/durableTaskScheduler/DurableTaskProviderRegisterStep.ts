/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceManagementClient } from '@azure/arm-resources';
import { AzureWizardExecuteStep, type ISubscriptionActionContext, maskUserInfo, parseError } from '@microsoft/vscode-azext-utils';
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
            // Poll once after registering, then keep polling only while the provider is still "Registering".
            // Any other state (such as "NotRegistered" or "Unregistered") is final, so fail without waiting.
            const maxTime = Date.now() + this._maxWaitMs;
            do {
                await delay(this._pollIntervalMs);
                state = (await client.providers.get(DurableTaskProvider)).registrationState;
            } while (isRegistering(state) && Date.now() < maxTime);
        } catch (error) {
            const message = parseError(error).message;
            setProviderErrorTelemetry(context, message);
            throw new Error(localize(
                'dtsProviderRegisterFailed',
                'Failed to register resource provider "{0}" for subscription "{1}": {2}',
                DurableTaskProvider,
                context.subscriptionDisplayName,
                message), { cause: error });
        }

        if (!isRegistered(state) && !isRegistering(state)) {
            const message = localize(
                'dtsProviderRegistrationStateFailed',
                'Resource provider "{0}" is not registered for subscription "{1}" (state: "{2}"). Register the provider and try again.',
                DurableTaskProvider,
                context.subscriptionDisplayName,
                state ?? 'Unknown');
            setProviderErrorTelemetry(context, message);
            throw new Error(message);
        }
    }

    public shouldExecute(): boolean {
        return true;
    }
}

/**
 * Matches the telemetry that `VerifyProvidersStep` in `@microsoft/vscode-azext-azureutils` emits when registration fails
 */
function setProviderErrorTelemetry(context: ISubscriptionActionContext, message: string): void {
    const maskedErrorMessage = maskUserInfo(message, []);
    context.telemetry.properties.providerError = maskedErrorMessage;
    context.telemetry.properties.providerErrorV2 = maskedErrorMessage;
}

function isRegistered(state: string | undefined): boolean {
    return state?.toLowerCase() === 'registered';
}

function isRegistering(state: string | undefined): boolean {
    return state?.toLowerCase() === 'registering';
}
