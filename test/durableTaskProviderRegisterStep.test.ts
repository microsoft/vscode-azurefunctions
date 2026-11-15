/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceManagementClient } from '@azure/arm-resources';
import { Environment } from '@azure/ms-rest-azure-env';
import { ResourceGroupCreateStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, createSubscriptionContext, createTestActionContext, type IActionContext, type ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { DurableTaskProviderRegisterStep } from '../src/commands/durableTaskScheduler/DurableTaskProviderRegisterStep';
import { DurableTaskProvider } from '../src/constants';
import { assertThrowsAsync } from './assertThrowsAsync';
import './global.test';

suite('DurableTaskProviderRegisterStep', () => {
    const progress = { report: () => { /* ignore */ } };

    async function createContext(): Promise<ISubscriptionActionContext> {
        return Object.assign(await createTestActionContext(), createSubscriptionContext({
            name: 'Test subscription',
            subscriptionId: 'test-subscription',
            tenantId: 'test-tenant',
            environment: Environment.AzureCloud,
            isCustomCloud: false,
            authentication: {
                getSession: () => assert.fail('Provider fixtures must not authenticate.'),
                getSessionWithScopes: () => assert.fail('Provider fixtures must not authenticate.'),
            },
        }));
    }

    interface FakeProviders {
        getStates: (string | undefined)[];
        registerState?: string;
        registerError?: Error;
        getError?: Error;
        registerCalls: number;
        getCalls?: number;
    }

    function createStep(fake: FakeProviders, maxWaitMs: number = 50): DurableTaskProviderRegisterStep<ISubscriptionActionContext> {
        const providers = {
            get: async (namespace: string) => {
                assert.strictEqual(namespace, DurableTaskProvider);
                fake.getCalls = (fake.getCalls ?? 0) + 1;
                if (fake.getError) {
                    throw fake.getError;
                }
                const state = fake.getStates.length > 1 ? fake.getStates.shift() : fake.getStates[0];
                return { registrationState: state };
            },
            register: async (namespace: string) => {
                assert.strictEqual(namespace, DurableTaskProvider);
                fake.registerCalls++;
                if (fake.registerError) {
                    throw fake.registerError;
                }
                return { registrationState: fake.registerState };
            },
        } as unknown as ResourceManagementClient['providers'];

        return new DurableTaskProviderRegisterStep<ISubscriptionActionContext>({
            createClient: async () => ({ providers }),
            pollIntervalMs: 1,
            maxWaitMs,
        });
    }

    test('runs before the resource group is created', () => {
        const step = new DurableTaskProviderRegisterStep();
        assert.ok(step.priority < new ResourceGroupCreateStep().priority);
        assert.strictEqual(step.shouldExecute(), true);
    });

    test('does nothing when the provider is already registered', async () => {
        const fake: FakeProviders = { getStates: ['Registered'], registerCalls: 0 };
        await createStep(fake).execute(await createContext(), progress);
        assert.strictEqual(fake.registerCalls, 0);
    });

    test('registers the provider and waits for registration', async () => {
        const fake: FakeProviders = { getStates: ['NotRegistered', 'Registering', 'Registered'], registerState: 'Registering', registerCalls: 0 };
        await createStep(fake).execute(await createContext(), progress);
        assert.strictEqual(fake.registerCalls, 1);
    });

    test('continues while registration is still in progress', async () => {
        const fake: FakeProviders = { getStates: ['NotRegistered', 'Registering'], registerState: 'Registering', registerCalls: 0 };
        await createStep(fake).execute(await createContext(), progress);
        assert.strictEqual(fake.registerCalls, 1);
    });

    test('throws when the register call fails', async () => {
        const fake: FakeProviders = { getStates: ['NotRegistered'], registerError: new Error('AuthorizationFailed'), registerCalls: 0 };
        await assertThrowsAsync(
            async () => createStep(fake).execute(await createContext(), progress),
            (error: Error) => error.message.includes(DurableTaskProvider) && error.message.includes('AuthorizationFailed'));
    });

    test('throws with the original error as the cause when reading the provider fails', async () => {
        const getError = new Error('AuthorizationFailed');
        const fake: FakeProviders = { getStates: ['NotRegistered'], getError, registerCalls: 0 };
        const context = await createContext();
        await assertThrowsAsync(
            async () => createStep(fake).execute(context, progress),
            (error: Error) => error.message.includes('AuthorizationFailed') && error.cause === getError);
        assert.strictEqual(fake.registerCalls, 0);
        assert.strictEqual(context.telemetry.properties.providerError, 'AuthorizationFailed');
        assert.strictEqual(context.telemetry.properties.providerErrorV2, 'AuthorizationFailed');
    });

    test('throws when the provider never becomes registered', async () => {
        const fake: FakeProviders = { getStates: ['NotRegistered'], registerState: 'NotRegistered', registerCalls: 0 };
        await assertThrowsAsync(
            async () => createStep(fake).execute(await createContext(), progress),
            (error: Error) => error.message.includes(DurableTaskProvider) && error.message.includes('NotRegistered'));
        assert.strictEqual(fake.registerCalls, 1);
    });

    test('throws right away when registration ends in a failure state', async () => {
        // A long timeout shows the step stops polling as soon as the state is no longer "Registering"
        const fake: FakeProviders = { getStates: ['NotRegistered', 'Registering', 'Unregistered', 'Registering'], registerState: 'Registering', registerCalls: 0 };
        const context = await createContext();
        const start = Date.now();
        await assertThrowsAsync(
            async () => createStep(fake, 60 * 1000).execute(context, progress),
            (error: Error) => error.message.includes(DurableTaskProvider) && error.message.includes('Unregistered'));
        assert.ok(Date.now() - start < 10 * 1000);
        assert.strictEqual(fake.registerCalls, 1);
        assert.strictEqual(fake.getCalls, 3);
        assert.ok(String(context.telemetry.properties.providerError).includes('Unregistered'));
    });

    test('stops the wizard before the resource group is created when registration fails', async () => {
        const executed: string[] = [];
        class FakeResourceGroupCreateStep extends ResourceGroupCreateStep<IActionContext & ISubscriptionActionContext> {
            public async execute(): Promise<void> {
                executed.push('ResourceGroupCreateStep');
            }
            public shouldExecute(): boolean {
                return true;
            }
        }

        const fake: FakeProviders = { getStates: ['NotRegistered'], registerError: new Error('AuthorizationFailed'), registerCalls: 0 };
        const context = await createContext();
        const wizard = new AzureWizard(context, {
            // Listed out of order on purpose: the wizard sorts execute steps by priority
            executeSteps: [new FakeResourceGroupCreateStep(), createStep(fake)],
        });
        await assertThrowsAsync(
            async () => wizard.execute(),
            (error: Error) => error.message.includes('AuthorizationFailed'));
        assert.strictEqual(fake.registerCalls, 1);
        assert.deepStrictEqual(executed, []);
    });
});
