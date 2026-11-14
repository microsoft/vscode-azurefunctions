/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceGroup } from '@azure/arm-resources';
import { Environment } from '@azure/ms-rest-azure-env';
import { type IResourceGroupWizardContext, ResourceGroupNameStep } from '@microsoft/vscode-azext-azureutils';
import { createSubscriptionContext, createTestActionContext, type TestUserInput } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { SchedulerNamingStep } from '../src/commands/durableTaskScheduler/SchedulerNamingStep';
import './global.test';

suite('SchedulerNamingStep', () => {
    async function createContext(names: string[] = []): Promise<IResourceGroupWizardContext & { ui: TestUserInput; schedulerName?: string }> {
        return Object.assign(await createTestActionContext(), createSubscriptionContext({
            name: 'Test subscription',
            subscriptionId: 'test-subscription',
            tenantId: 'test-tenant',
            environment: Environment.AzureCloud,
            isCustomCloud: false,
            authentication: {
                getSession: () => assert.fail('Naming fixtures must not authenticate.'),
                getSessionWithScopes: () => assert.fail('Naming fixtures must not authenticate.'),
            },
        }), {
            resourceGroupsTask: Promise.resolve(names.map(name => ({ name, location: 'westus' } satisfies ResourceGroup))),
        });
    }

    for (const [description, schedulerName, existingNames, expectedName] of [
        ['preserves an available name', 'scheduler', [], 'scheduler'],
        ['avoids a case-insensitive collision', 'scheduler', ['SCHEDULER'], 'scheduler2'],
        ['skips occupied suffixes', 'scheduler', ['scheduler', 'scheduler2'], 'scheduler3'],
        ['respects the maximum length when suffixing', 'a'.repeat(90), ['a'.repeat(90)], `${'a'.repeat(89)}2`],
        ['removes invalid resource-group characters', 'my scheduler!', [], 'myscheduler'],
        ['removes trailing periods', 'scheduler...', [], 'scheduler'],
        ['leaves no suggestion when no valid characters remain', '!!!', [], undefined],
        ['leaves no suggestion after exhausting candidates', 'scheduler', Array.from({ length: 99 }, (_, i) => i === 0 ? 'scheduler' : `scheduler${i + 1}`), undefined],
    ] satisfies [string, string, string[], string | undefined][]) {
        test(description, async () => {
            const context = await createContext(existingNames);
            const step = new SchedulerNamingStep();
            assert.strictEqual(step.shouldPrompt(context), true);

            await context.ui.runWithInputs([schedulerName], async () => step.prompt(context));

            assert.strictEqual(context.schedulerName, schedulerName);
            assert.strictEqual(await context.relatedNameTask, expectedName);
            assert.strictEqual(context.newResourceGroupName, undefined);
            assert.strictEqual(step.shouldPrompt(context), false);
        });
    }

    test('the suggested resource group can be accepted by the shared prompt', async () => {
        const context = await createContext(['scheduler']);
        await context.ui.runWithInputs(['scheduler'], async () => new SchedulerNamingStep().prompt(context));
        const suggestion = await context.relatedNameTask;
        assert.strictEqual(suggestion, 'scheduler2');

        await context.ui.runWithInputs([suggestion], async () => new ResourceGroupNameStep().prompt(context));

        assert.strictEqual(context.newResourceGroupName, 'scheduler2');
        assert.strictEqual(context.schedulerName, 'scheduler');
    });

    test('regenerates the suggestion when the scheduler name changes after Back', async () => {
        const context = await createContext(['first', 'second', 'second2']);
        const step = new SchedulerNamingStep();
        await context.ui.runWithInputs(['first'], async () => step.prompt(context));
        assert.strictEqual(await context.relatedNameTask, 'first2');

        await context.ui.runWithInputs(['second'], async () => step.prompt(context));

        assert.strictEqual(await context.relatedNameTask, 'second3');
        assert.strictEqual(context.schedulerName, 'second');
    });
});
