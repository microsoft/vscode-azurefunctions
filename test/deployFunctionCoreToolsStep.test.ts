/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type InnerDeployContext } from '@microsoft/vscode-azext-azureappservice';
import { createTestActionContext, initializeWorkflowTelemetry, TestOutputChannel, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { DeployFunctionCoreToolsStep } from '../src/commands/deploy/DeployFunctionCoreToolsStep';
import { ext } from '../src/extensionVariables';
import { cpUtils } from '../src/utils/cpUtils';
import { runWithTelemetryContext } from './utils/runWithTelemetryContext';

suite('Deploy Function Core Tools outcome', () => {
    let originalExecute: typeof cpUtils.tryExecuteCommand;
    let originalOutput: typeof ext.outputChannel;
    let outputShown: boolean;

    setup(() => {
        originalExecute = cpUtils.tryExecuteCommand;
        originalOutput = ext.outputChannel;
        ext.outputChannel = new TestOutputChannel();
        outputShown = false;
        ext.outputChannel.show = () => { outputShown = true; };
    });

    teardown(() => {
        cpUtils.tryExecuteCommand = originalExecute;
        ext.outputChannel = originalOutput;
    });

    for (const code of [0, 1, 2, null]) {
        test(`CLI ${code === null ? 'execution error without numeric exit' : `exit ${code}`} ${code === 0 ? 'completes' : 'fails instead of reporting success'}`, async () => {
            const context = Object.assign(await createTestActionContext(), {
                originalDeployFsPath: 'local-project',
                site: { siteName: 'test-app', fullName: 'test-app', isSlot: false },
            }) as unknown as InnerDeployContext;
            initializeWorkflowTelemetry(context, { workflow: 'deploy', command: 'deploy' });
            cpUtils.tryExecuteCommand = async (output, cwd, executable) => {
                assert.strictEqual(output, ext.outputChannel);
                assert.strictEqual(cwd, context.originalDeployFsPath);
                assert.strictEqual(executable, 'func');
                return {
                    code: code ?? 1,
                    exitCode: code,
                    cmdOutput: 'process output',
                    cmdOutputIncludingStderr: 'process output and error',
                    formattedCommandLine: 'func',
                };
            };

            const execution = runWithTelemetryContext(context, async () =>
                new DeployFunctionCoreToolsStep().execute(context, { report: () => undefined }));
            if (code === 0) {
                await execution;
            } else {
                await assert.rejects(execution, /Failed to run "func" command/);
            }
            assert.strictEqual(outputShown, code !== 0);
            assert.strictEqual(context.telemetry.properties.result, code === 0 ? 'Succeeded' : 'Failed');
            assert.strictEqual(context.telemetry.properties.deploymentMechanism, 'funccli');
            assert.strictEqual(context.telemetry.properties.deploymentStatus, 'unknown');
            if (code !== 0) {
                assert.strictEqual(context.telemetry.properties.outcome, 'failed');
                assert.strictEqual(context.telemetry.properties.failureCode, 'funcCliFailed');
            } else {
                assert.strictEqual(context.telemetry.properties.outcome, 'succeeded');
            }
            assert.deepStrictEqual(context.activityAttributes?.logs, [{ content: 'process output and error' }]);
            assert.ok(!JSON.stringify(context.telemetry).includes('process output'));
        });
    }

    for (const canceled of [false, true]) {
        test(`CLI ${canceled ? 'cancellation' : 'unobserved exit'} is not fabricated as a known exit failure`, async () => {
            const context = Object.assign(await createTestActionContext(), {
                originalDeployFsPath: 'local-project',
                site: { siteName: 'test-app', fullName: 'test-app', isSlot: false },
            }) as unknown as InnerDeployContext;
            initializeWorkflowTelemetry(context, { workflow: 'deploy', command: 'deploy' });
            cpUtils.tryExecuteCommand = async () => {
                if (canceled) {
                    throw new UserCancelledError();
                }
                return { code: 1, cmdOutput: '', cmdOutputIncludingStderr: '', formattedCommandLine: 'func' };
            };
            await runWithTelemetryContext(context, async () =>
                new DeployFunctionCoreToolsStep().execute(context, { report: () => undefined }));
            assert.strictEqual(context.telemetry.properties.outcome, canceled ? 'canceled' : 'unknown');
            assert.strictEqual(context.telemetry.properties.deploymentStatus, 'unknown');
            assert.notStrictEqual(context.telemetry.properties.failureCode, 'funcCliFailed');
        });
    }
});
