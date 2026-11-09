/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, initializeWorkflowTelemetry, registerTelemetryHandler, setWorkflowTelemetryDetails, TestOutputChannel, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { window } from 'vscode';
import { type IFuncDeployContext } from '../src/commands/deploy/deploy';
import { notifyDeployComplete } from '../src/commands/deploy/notifyDeployComplete';
import { ext } from '../src/extensionVariables';
import { type SlotTreeItem } from '../src/tree/SlotTreeItem';
import { RemoteFunctionsTreeItem } from '../src/tree/remoteProject/RemoteFunctionsTreeItem';
import { runWithTelemetryContext } from './utils/runWithTelemetryContext';

suite('Workflow deployment completion telemetry', () => {
    let originalDialog: typeof window.showInformationMessage;
    let originalOutput: typeof ext.outputChannel;

    setup(() => {
        originalDialog = window.showInformationMessage;
        originalOutput = ext.outputChannel;
        ext.outputChannel = new TestOutputChannel();
        window.showInformationMessage = async () => undefined;
    });

    teardown(() => {
        window.showInformationMessage = originalDialog;
        ext.outputChannel = originalOutput;
    });

    for (const failedAttempts of [0, 1, 5]) {
        test(`trigger discovery after ${failedAttempts} failures reports only observed retry/recovery`, async function () {
            this.timeout(45000);
            const context = await createTestActionContext() as unknown as IFuncDeployContext;
            initializeWorkflowTelemetry(context, { workflow: 'deploy', command: 'deploy' });
            setWorkflowTelemetryDetails(context, { deploymentMechanism: 'zip', deploymentStatus: 'succeeded' });
            const children: IActionContext[] = [];
            const telemetry = registerTelemetryHandler(child => {
                if (child.callbackId === 'postDeploy') {
                    children.push(child);
                }
            });
            const functions: RemoteFunctionsTreeItem = Object.create(RemoteFunctionsTreeItem.prototype);
            functions.getCachedChildren = async () => [];
            let attempts = 0;
            const node = {
                site: { fullName: 'test-app' },
                initSite: async () => undefined,
                getCachedChildren: async () => {
                    if (++attempts <= failedAttempts) {
                        throw Object.assign(new Error('test trigger lookup failure'), { code: 'ETIMEDOUT' });
                    }
                    return [functions];
                },
                treeDataProvider: { refresh: async () => undefined },
            } as unknown as SlotTreeItem;
            try {
                const execution = runWithTelemetryContext(context, async () =>
                    notifyDeployComplete(context, node, context.workspaceFolder, false, false));
                if (failedAttempts === 5) {
                    await assert.rejects(execution, /test trigger lookup failure/);
                } else {
                    await execution;
                }
                await new Promise(resolve => setImmediate(resolve));
            } finally {
                telemetry.dispose();
            }

            assert.strictEqual(attempts, failedAttempts === 5 ? 5 : failedAttempts + 1);
            assert.strictEqual(context.telemetry.measurements.retryCount, attempts - 1);
            assert.strictEqual(context.telemetry.properties.outcome, failedAttempts === 5 ? 'failed' : 'succeeded');
            assert.strictEqual(context.telemetry.properties.deploymentStatus, 'succeeded');
            if (failedAttempts === 1) {
                assert.strictEqual(context.telemetry.properties.recoveredAfterRetry, 'true');
            } else {
                assert.notStrictEqual(context.telemetry.properties.recoveredAfterRetry, 'true');
            }
            if (failedAttempts === 5) {
                assert.strictEqual(context.telemetry.properties.failureCode, 'triggerDiscoveryFailed');
                assert.strictEqual(context.telemetry.properties.networkCategory, 'timeout');
            }
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].telemetry.properties.isWorkflowRoot, 'false');
            assert.strictEqual(children[0].telemetry.properties.workflowRunId, context.telemetry.properties.workflowRunId);
            assert.notStrictEqual(children[0].telemetry.properties.attemptId, context.telemetry.properties.attemptId);
        });
    }

    test('a later notification response is a child and leaves the finalized root unchanged', async () => {
        const context = await createTestActionContext() as unknown as IFuncDeployContext;
        initializeWorkflowTelemetry(context, { workflow: 'deploy', command: 'deploy' });
        let respond: (() => void) | undefined;
        window.showInformationMessage = () => new Promise(resolve => { respond = () => resolve(undefined); });
        let childCompleted: ((child: IActionContext) => void) | undefined;
        const completion = new Promise<IActionContext>(resolve => { childCompleted = resolve; });
        const telemetry = registerTelemetryHandler(child => {
            if (child.callbackId === 'postDeploy') {
                childCompleted?.(child);
            }
        });
        const node = {
            site: { fullName: 'test-app' },
            initSite: async () => undefined,
        } as unknown as SlotTreeItem;
        try {
            await runWithTelemetryContext(context, async () =>
                notifyDeployComplete(context, node, context.workspaceFolder, false, true));
            const rootSnapshot = JSON.stringify(context.telemetry);
            assert.ok(respond);
            respond();
            const child = await completion;
            assert.strictEqual(child.telemetry.properties.isWorkflowRoot, 'false');
            assert.strictEqual(child.telemetry.properties.workflowRunId, context.telemetry.properties.workflowRunId);
            assert.strictEqual(child.telemetry.properties.parentAttemptId, context.telemetry.properties.attemptId);
            assert.strictEqual(child.telemetry.properties.userWaitTiming, 'unavailable');
            assert.strictEqual(child.telemetry.measurements.userWaitDuration, undefined);
            assert.strictEqual(JSON.stringify(context.telemetry), rootSnapshot);
        } finally {
            telemetry.dispose();
        }
    });
});
