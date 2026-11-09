/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, initializeWorkflowTelemetry, registerOnActionStartHandler, registerTelemetryHandler, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { validateFuncCoreToolsInstalled } from '../src/funcCoreTools/validateFuncCoreToolsInstalled';
import { validateGoInstalled } from '../src/funcCoreTools/validateGoInstalled';
import { cpUtils } from '../src/utils/cpUtils';
import { runWithFuncSetting } from './runWithSetting';
import { runWithTelemetryContext } from './utils/runWithTelemetryContext';

suite('Workflow prerequisite telemetry', () => {
    let originalExecute: typeof cpUtils.executeCommand;
    let originalTryExecute: typeof cpUtils.tryExecuteCommand;

    setup(() => {
        originalExecute = cpUtils.executeCommand;
        originalTryExecute = cpUtils.tryExecuteCommand;
    });

    teardown(() => {
        cpUtils.executeCommand = originalExecute;
        cpUtils.tryExecuteCommand = originalTryExecute;
    });

    for (const prerequisite of ['coreTools', 'go'] as const) {
        for (const installed of [false, true]) {
            test(`${prerequisite} ${installed ? 'available does not block' : 'unavailable remains blocked when its prompt is dismissed'}`, async () => {
                const context = await createTestActionContext();
                initializeWorkflowTelemetry(context, { workflow: 'deploy', command: 'deploy' });
                const children: IActionContext[] = [];
                const event = prerequisite === 'coreTools'
                    ? 'azureFunctions.validateFuncCoreToolsInstalled'
                    : 'azureFunctions.validateGoInstalled';
                const handler = registerOnActionStartHandler(inner => {
                    if (inner.callbackId === event) {
                        inner.ui.showWarningMessage = async () => { throw new UserCancelledError(); };
                    }
                });
                const telemetry = registerTelemetryHandler(inner => {
                    if (inner.callbackId === event) {
                        children.push(inner);
                    }
                });
                cpUtils.executeCommand = async () => {
                    if (!installed) {
                        throw new Error('test executable unavailable');
                    }
                    return '4.0.0';
                };
                cpUtils.tryExecuteCommand = async () => ({
                    code: installed ? 0 : 1,
                    cmdOutput: '',
                    cmdOutputIncludingStderr: '',
                    formattedCommandLine: 'go',
                });
                try {
                    await runWithFuncSetting('funcCliPath', undefined, async () =>
                        runWithFuncSetting(prerequisite === 'coreTools' ? 'validateFuncCoreTools' : 'validateGo', true, async () => {
                            const result = prerequisite === 'coreTools'
                                ? await validateFuncCoreToolsInstalled(context, 'test prerequisite')
                                : await validateGoInstalled(context);
                            assert.strictEqual(result, installed);
                        }));
                } finally {
                    handler.dispose();
                    telemetry.dispose();
                }
                await runWithTelemetryContext(context, async () => undefined);

                assert.strictEqual(children.length, 1);
                assert.strictEqual(children[0].telemetry.properties.workflowRunId, context.telemetry.properties.workflowRunId);
                assert.strictEqual(children[0].telemetry.properties.parentAttemptId, context.telemetry.properties.attemptId);
                assert.notStrictEqual(children[0].telemetry.properties.attemptId, context.telemetry.properties.attemptId);
                assert.strictEqual(children[0].telemetry.properties.isWorkflowRoot, 'false');
                if (installed) {
                    assert.notStrictEqual(context.telemetry.properties.outcome, 'blocked');
                    assert.strictEqual(context.telemetry.properties.failureCode, undefined);
                } else {
                    assert.strictEqual(children[0].telemetry.properties.result, 'Canceled');
                    assert.strictEqual(children[0].telemetry.properties.outcome, 'blocked');
                    assert.strictEqual(context.telemetry.properties.outcome, 'blocked');
                    assert.strictEqual(context.telemetry.properties.cancelReason, 'prerequisite');
                    assert.strictEqual(context.telemetry.properties.failureCode,
                        prerequisite === 'coreTools' ? 'coreToolsUnavailable' : 'goUnavailable');
                    assert.ok(!JSON.stringify(context.telemetry).includes('test executable'));
                }
            });
        }
    }
});
