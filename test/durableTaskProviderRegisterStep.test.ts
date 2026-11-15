/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceManagementClient } from '@azure/arm-resources';
import { Environment } from '@azure/ms-rest-azure-env';
import { ResourceGroupCreateStep } from '@microsoft/vscode-azext-azureutils';
import { createSubscriptionContext, createTestActionContext, type ISubscriptionActionContext } from '@microsoft/vscode-azext-utils';
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
        registerCalls: number;
    }

    function createStep(fake: FakeProviders): DurableTaskProviderRegisterStep<ISubscriptionActionContext> {
        const providers = {
            get: async (namespace: string) => {
                assert.strictEqual(namespace, DurableTaskProvider);
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
            maxWaitMs: 50,
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

    test('throws when the provider never becomes registered', async () => {
        const fake: FakeProviders = { getStates: ['NotRegistered'], registerState: 'NotRegistered', registerCalls: 0 };
        await assertThrowsAsync(
            async () => createStep(fake).execute(await createContext(), progress),
            (error: Error) => error.message.includes(DurableTaskProvider) && error.message.includes('NotRegistered'));
        assert.strictEqual(fake.registerCalls, 1);
    });
});
