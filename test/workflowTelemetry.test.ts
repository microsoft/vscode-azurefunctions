/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { commands } from 'vscode';
import { FuncVersion } from '../src/FuncVersion';
import { testFolderPath } from './global.test';
import { runWithFuncSetting } from './runWithSetting';
import { getTestApi } from './utils/testApiAccess';

suite('Workflow telemetry bundled command wiring', () => {
    async function runCommand(command: string, ...args: unknown[]): Promise<IActionContext> {
        let captured: IActionContext | undefined;
        const api = await getTestApi();
        const handler = api.testing.registerOnActionStartHandler(context => {
            if ('callbackId' in context && context.callbackId === `azureFunctions.${command}`) {
                captured = context;
                context.errorHandling.suppressDisplay = true;
                context.ui.showQuickPick = async () => { throw new UserCancelledError(); };
                context.ui.showWarningMessage = async () => { throw new UserCancelledError(); };
            }
        });
        try {
            await commands.executeCommand(`azureFunctions.${command}`, ...args);
        } finally {
            handler.dispose();
        }
        assert.ok(captured, `Expected registered ${command} action.`);
        assert.strictEqual(captured.telemetry.properties.command, command);
        assert.strictEqual(captured.telemetry.properties.isWorkflowRoot, 'true');
        const workflowRunId = captured.telemetry.properties.workflowRunId;
        const attemptId = captured.telemetry.properties.attemptId;
        assert.ok(typeof workflowRunId === 'string');
        assert.ok(typeof attemptId === 'string');
        assert.match(workflowRunId, /^[0-9a-f-]{36}$/i);
        assert.match(attemptId, /^[0-9a-f-]{36}$/i);
        return captured;
    }

    test('classic creation retains a stable registered prompt identity after bundling', async () => {
        const context = await runCommand('createNewProject',
            testFolderPath, undefined, FuncVersion.v4, false, undefined, undefined, undefined, { startFromScratch: true });

        assert.strictEqual(context.telemetry.properties.workflow, 'createProject');
        assert.strictEqual(context.telemetry.properties.outcome, 'canceled');
        assert.strictEqual(context.telemetry.properties.cancelReason, 'unknown');
        assert.strictEqual(context.telemetry.properties.lastStep, 'prompt-NewProjectLanguageStep');
    });

    test('Dockerfile creation is its own root and preserves real dismissal', async () => {
        await runWithFuncSetting('validateFuncCoreTools', false, async () => {
            const context = await runCommand('createNewProjectWithDockerfile');
            assert.strictEqual(context.telemetry.properties.workflow, 'createProject');
            assert.strictEqual(context.telemetry.properties.outcome, 'canceled');
        });
    });

    for (const command of ['deploy', 'deployProject', 'deploySlot', 'deployByFunctionAppId']) {
        test(`${command} initializes exactly one deployment root before project selection`, async () => {
            const context = await runCommand(command);
            assert.strictEqual(context.telemetry.properties.workflow, 'deploy');
            assert.strictEqual(context.telemetry.properties.outcome, 'canceled');
        });
    }

    test('redeploy passes the existing root to the shared deployment node', async () => {
        let nodeContext: IActionContext | undefined;
        const context = await runCommand('redeploy', {
            redeployDeployment: async (actionContext: IActionContext) => {
                nodeContext = actionContext;
                throw new UserCancelledError();
            },
        });
        assert.strictEqual(nodeContext, context);
        assert.strictEqual(context.telemetry.properties.workflow, 'deploy');
        assert.strictEqual(context.telemetry.properties.outcome, 'canceled');
    });
});
