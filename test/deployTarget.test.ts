/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Environment } from '@azure/ms-rest-azure-env';
import { registerAppServiceExtensionVariables } from '@microsoft/vscode-azext-azureappservice';
import { UserCancelledError, createTestActionContext, testGlobalSetup, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type AzureHostExtensionApi } from '@microsoft/vscode-azext-utils/hostapi';
import * as assert from 'assert';
import { mock } from 'node:test';
import { Uri, workspace, type WorkspaceFolder } from 'vscode';
import { SubscriptionListStep } from '../src/commands/SubscriptionListStep';
import { type IFuncDeployContext } from '../src/commands/deploy/deploy';
import { getFunctionAppToDeploy } from '../src/commands/deploy/getOrCreateFunctionApp';
import { CodeAction } from '../src/constants';
import { ext } from '../src/extensionVariables';
import { getResourceGroupsApi } from '../src/getExtensionApi';
import { ResolvedFunctionAppResource } from '../src/tree/ResolvedFunctionAppResource';
import { type SlotTreeItem } from '../src/tree/SlotTreeItem';
import { updateWorkspaceSetting } from '../src/vsCodeConfig/settings';
import { getTestWorkspaceFolder } from './global.test';

suite('Deployment target selection', () => {
    const defaultSetting = 'defaultFunctionAppToDeploy';
    const slotContext = ResolvedFunctionAppResource.pickSlotContextValue;
    const appId = '/subscriptions/test-subscription/resourceGroups/test-group/providers/Microsoft.Web/sites/test-app';
    const production = target(appId, ResolvedFunctionAppResource.productionContextValue);
    const slot = target(`${appId}/slots/staging`, ResolvedFunctionAppResource.slotContextValue);
    const targets = new Map([[production.fullId, production], [slot.fullId, slot]]);
    let originalApi: AzureHostExtensionApi;
    let api: AzureHostExtensionApi;
    let folder: WorkspaceFolder;
    let originalDefault: string | undefined;
    let context: IFuncDeployContext;

    function target(id: string, contextValue: string): SlotTreeItem {
        return {
            id, label: 'Test target', fullId: id, contextValue,
            initSite: async (_context: IActionContext): Promise<void> => { assert.fail('Target selection must not initialize a site or deploy.'); },
        } as SlotTreeItem;
    }

    suiteSetup(async () => {
        registerAppServiceExtensionVariables({ ...testGlobalSetup(), prefix: 'azureFunctions' });
        const testFolder = workspace.getWorkspaceFolder(Uri.file(getTestWorkspaceFolder()));
        assert.ok(testFolder);
        folder = testFolder;
        originalDefault = workspace.getConfiguration('azureFunctions', folder.uri).inspect<string>(defaultSetting)?.workspaceFolderValue;
        originalApi = ext.rgApi;
        api = await getResourceGroupsApi();
        ext.rgApi = api;
    });

    suiteTeardown(async () => {
        ext.rgApi = originalApi;
        await updateWorkspaceSetting(defaultSetting, originalDefault, folder.uri.fsPath);
    });

    setup(async () => {
        await updateWorkspaceSetting(defaultSetting, undefined, folder.uri.fsPath);
        context = Object.assign(await createTestActionContext(), {
            action: CodeAction.Deploy,
            projectPath: folder.uri.fsPath,
            workspaceFolder: folder,
            originalDeployFsPath: folder.uri.fsPath,
            effectiveDeployFsPath: folder.uri.fsPath,
            defaultAppSetting: defaultSetting,
            registerActivity: async () => assert.fail('Target selection must not register an activity.'),
            subscription: {
                name: 'Test subscription', subscriptionId: 'test-subscription', tenantId: 'test-tenant',
                environment: Environment.AzureCloud, isCustomCloud: false,
                authentication: {
                    getSession: () => assert.fail('Target fixtures must not authenticate.'),
                    getSessionWithScopes: () => assert.fail('Target fixtures must not authenticate.'),
                },
            },
        });
        mock.method(api.tree, 'findTreeItem', async (id: string) => targets.get(id));
    });

    teardown(() => mock.reset());

    async function resolve(source: 'tree' | 'api' | 'setting', node: SlotTreeItem, expectedContextValue?: RegExp): Promise<SlotTreeItem> {
        if (source === 'setting') {
            await updateWorkspaceSetting(defaultSetting, node.fullId, folder.uri.fsPath);
        }
        return await getFunctionAppToDeploy(context,
            source === 'tree' ? node : undefined,
            source === 'api' ? node.fullId : undefined,
            expectedContextValue);
    }

    test('palette slot deployment picks a slot without entering app creation', async () => {
        const pick = mock.method(api, 'pickAppResource', async () => slot);

        assert.strictEqual(await getFunctionAppToDeploy(context, undefined, undefined, slotContext), slot);
        assert.strictEqual(pick.mock.callCount(), 1);
        assert.strictEqual(pick.mock.calls[0].arguments[0], context);
        assert.deepStrictEqual(pick.mock.calls[0].arguments[1]?.expectedChildContextValue, slotContext);
        assert.strictEqual(context.appSource, 'nodePicker');
        assert.strictEqual(context.isNewApp, undefined);
    });

    for (const source of ['tree', 'api', 'setting'] as const) {
        test(`ordinary production deployment preserves a ${source} target`, async () => {
            const pick = mock.method(api.appResourceTree, 'showTreeItemPicker', async () => assert.fail('Production deployment must not pick a slot.'));
            const apps = mock.method(api, 'pickAppResource', async () => assert.fail('An existing target must not be repicked.'));

            assert.strictEqual(await resolve(source, production), production);
            assert.strictEqual(context.appSource, source);
            assert.strictEqual(pick.mock.callCount(), 0);
            assert.strictEqual(apps.mock.callCount(), 0);
        });

        test(`slot deployment preserves an explicit ${source} slot`, async () => {
            const pick = mock.method(api.appResourceTree, 'showTreeItemPicker', async () => assert.fail('An explicit slot must not be repicked.'));

            assert.strictEqual(await resolve(source, slot, slotContext), slot);
            assert.strictEqual(context.appSource, source);
            assert.strictEqual(pick.mock.callCount(), 0);
        });

        test(`slot deployment picks within a ${source} production app`, async () => {
            const pick = mock.method(api.appResourceTree, 'showTreeItemPicker', async () => slot);
            const apps = mock.method(api, 'pickAppResource', async () => assert.fail('Keep the supplied or default app as the picker root.'));

            assert.strictEqual(await resolve(source, production, slotContext), slot);
            assert.strictEqual(context.appSource, source);
            assert.deepStrictEqual(pick.mock.calls[0].arguments, [slotContext, context, production]);
            assert.strictEqual(apps.mock.callCount(), 0);
        });
    }

    test('ordinary palette deployment retains the existing app-selection wizard', async () => {
        context.site = { id: production.fullId, name: 'test-app', kind: 'functionapp', location: 'westus' };
        const subscription = context.subscription;
        mock.method(SubscriptionListStep.prototype, 'configureBeforePrompt', async wizardContext => {
            assert.strictEqual(wizardContext.subscription, subscription);
        });
        const apps = mock.method(api, 'pickAppResource', async () => assert.fail('Production selection must keep its creation-capable wizard.'));

        assert.strictEqual(await getFunctionAppToDeploy(context, undefined, undefined), production);
        assert.strictEqual(context.appSource, 'nodePicker');
        assert.strictEqual(apps.mock.callCount(), 0);
    });

    test('a local project tree argument still prompts for a remote slot', async () => {
        const project = target('local-project', 'azFuncLocalProject');
        const pick = mock.method(api, 'pickAppResource', async () => slot);

        assert.strictEqual(await getFunctionAppToDeploy(context, project, undefined, slotContext), slot);
        assert.strictEqual(context.appSource, 'nodePicker');
        assert.strictEqual(pick.mock.callCount(), 1);
    });

    for (const project of [Uri.file('test-project'), 'test-project']) {
        test(`a ${typeof project === 'string' ? 'string' : 'URI'} project argument preserves default destination resolution`, async () => {
            await updateWorkspaceSetting(defaultSetting, production.fullId, folder.uri.fsPath);
            const pick = mock.method(api.appResourceTree, 'showTreeItemPicker', async () => slot);

            assert.strictEqual(await getFunctionAppToDeploy(context, project, undefined, slotContext), slot);
            assert.strictEqual(context.appSource, 'setting');
            assert.strictEqual(pick.mock.calls[0].arguments[2], production);
        });
    }

    test('a missing saved destination falls back to slot selection, not app creation', async () => {
        await updateWorkspaceSetting(defaultSetting, 'missing-app', folder.uri.fsPath);
        const pick = mock.method(api, 'pickAppResource', async () => slot);

        assert.strictEqual(await getFunctionAppToDeploy(context, undefined, undefined, slotContext), slot);
        assert.strictEqual(context.appSource, 'nodePicker');
        assert.strictEqual(pick.mock.callCount(), 1);
    });

    test('a missing explicit API destination fails instead of silently choosing another app', async () => {
        const pick = mock.method(api, 'pickAppResource', async () => assert.fail('An invalid explicit ID must not fall back.'));

        await assert.rejects(getFunctionAppToDeploy(context, undefined, 'missing-app', slotContext), /Failed to find app matching id/);
        assert.strictEqual(pick.mock.callCount(), 0);
    });

    for (const invalidContext of [ResolvedFunctionAppResource.productionContextValue, 'azFuncSlots', ResolvedFunctionAppResource.flexContextValue]) {
        test(`rejects a final ${invalidContext} result instead of deploying to production`, async () => {
            mock.method(api.appResourceTree, 'showTreeItemPicker', async () => target(appId, invalidContext));

            await assert.rejects(resolve('tree', production, slotContext), /not a deployment slot/);
        });
    }

    test('slot-picker cancellation propagates without using the production target', async () => {
        const cancelled = new UserCancelledError();
        mock.method(api.appResourceTree, 'showTreeItemPicker', async () => { throw cancelled; });

        await assert.rejects(resolve('tree', production, slotContext), error => error === cancelled);
    });

    test('palette slot-picker cancellation propagates without entering app creation', async () => {
        const cancelled = new UserCancelledError();
        mock.method(api, 'pickAppResource', async () => { throw cancelled; });

        await assert.rejects(getFunctionAppToDeploy(context, undefined, undefined, slotContext), error => error === cancelled);
    });
});
