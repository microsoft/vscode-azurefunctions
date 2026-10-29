/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site } from '@azure/arm-appservice';
import { Environment } from '@azure/ms-rest-azure-env';
import { uiUtils } from '@microsoft/vscode-azext-azureutils';
import { createTestActionContext, type TestUserInput } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { mock } from 'node:test';
import { Uri } from 'vscode';
import { type IFuncDeployContext } from '../src/commands/deploy/deploy';
import { FunctionAppListStep } from '../src/commands/deploy/FunctionAppListStep';
import { CodeAction } from '../src/constants';
import './global.test';

suite('FunctionAppListStep', () => {
    const createLabel = '$(plus) Create new function app...';
    let sites: Site[];

    setup(() => {
        sites = [];
        mock.method(uiUtils, 'listAllIterator', async () => sites);
    });

    teardown(() => mock.reset());

    function site(name: string, resourceGroup: string, kind: string): Site {
        return { name, id: `/subscriptions/test-subscription/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${name}`, kind, location: 'westus' };
    }

    async function createContext(): Promise<IFuncDeployContext & { ui: TestUserInput }> {
        const workspaceFolder = { name: 'test-project', index: 0, uri: Uri.file('test-project') };
        return Object.assign(await createTestActionContext(), {
            action: CodeAction.Deploy,
            projectPath: workspaceFolder.uri.fsPath,
            workspaceFolder,
            originalDeployFsPath: workspaceFolder.uri.fsPath,
            effectiveDeployFsPath: workspaceFolder.uri.fsPath,
            defaultAppSetting: 'defaultFunctionAppToDeploy',
            registerActivity: async () => assert.fail('Listing apps must not register an activity.'),
            subscription: {
                name: 'Test subscription', subscriptionId: 'test-subscription', tenantId: 'test-tenant',
                environment: Environment.AzureCloud, isCustomCloud: false,
                authentication: {
                    getSession: () => assert.fail('Listing fixtures must not authenticate.'),
                    getSessionWithScopes: () => assert.fail('Listing fixtures must not authenticate.'),
                },
            },
        });
    }

    test('sorts function apps by name across resource groups and keeps creation first', async () => {
        const beta = site('beta-app', 'group-a', 'functionapp,linux');
        const alpha = site('alpha-app', 'group-z', 'functionapp');
        const zeta = site('zeta-app', 'group-b', 'functionapp,linux,container');
        sites = [beta, { kind: 'app', location: 'westus' }, alpha, { location: 'westus' }, zeta];
        const originalSites = [...sites];

        const picks = await new FunctionAppListStep()['getPicks'](await createContext());

        assert.deepStrictEqual(picks.map(pick => pick.label), [createLabel, 'alpha-app', 'beta-app', 'zeta-app']);
        assert.deepStrictEqual(picks.map(pick => pick.description), [undefined, 'group-z', 'group-a', 'group-b']);
        assert.strictEqual(picks[0].data, undefined);
        assert.strictEqual(picks[1].data, alpha);
        assert.strictEqual(picks[2].data, beta);
        assert.strictEqual(picks[3].data, zeta);
        assert.deepStrictEqual(sites, originalSites);
    });

    for (const [name, fixtures] of [
        ['empty response', []],
        ['no function apps', [{ kind: 'app', location: 'westus' }, { location: 'westus' }]],
    ] satisfies [string, Site[]][]) {
        test(`${name} still offers creation`, async () => {
            sites = fixtures;

            const picks = await new FunctionAppListStep()['getPicks'](await createContext());

            assert.deepStrictEqual(picks, [{ label: createLabel, data: undefined }]);
        });
    }

    test('selecting a sorted pick preserves the original site and skips creation', async () => {
        const alpha = site('alpha-app', 'group-z', 'functionapp');
        sites = [site('beta-app', 'group-a', 'functionapp,linux'), alpha];
        const context = await createContext();
        const step = new FunctionAppListStep();
        assert.strictEqual(step.shouldPrompt(context), true);

        await context.ui.runWithInputs(['alpha-app'], async () => step.prompt(context));

        assert.strictEqual(context.site, alpha);
        assert.strictEqual(step.shouldPrompt(context), false);
        assert.strictEqual(await step.getSubWizard(context), undefined);
    });
});
