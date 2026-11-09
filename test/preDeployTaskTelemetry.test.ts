/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAppServiceExtensionVariables, type IDeployContext } from '@microsoft/vscode-azext-azureappservice';
import { createTestActionContext, initializeWorkflowTelemetry } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { ConfigurationTarget, EventEmitter, ShellExecution, Task, tasks, window, workspace, type TaskProcessEndEvent, type WorkspaceFolder } from 'vscode';
import { runPreDeployTask } from '../src/commands/deploy/runPreDeployTask';
import { packTaskName, preDeployTaskSetting } from '../src/constants';
import { ext } from '../src/extensionVariables';
import { runWithFuncSetting } from './runWithSetting';
import { getTestApi } from './utils/testApiAccess';
import { runWithTelemetryContext } from './utils/runWithTelemetryContext';

suite('Workflow pre-deploy task telemetry', () => {
    let originalFetch: typeof tasks.fetchTasks;
    let originalExecute: typeof tasks.executeTask;
    let originalEnd: PropertyDescriptor | undefined;
    let originalExecutions: PropertyDescriptor | undefined;
    let originalDialog: typeof window.showErrorMessage;
    let ending: EventEmitter<TaskProcessEndEvent>;
    let folder: WorkspaceFolder;
    let oldTask: string | undefined;

    suiteSetup(async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        registerAppServiceExtensionVariables({ context, outputChannel: ext.outputChannel, prefix: ext.prefix });
    });

    setup(() => {
        assert.ok(workspace.workspaceFolders?.[0]);
        folder = workspace.workspaceFolders[0];
        oldTask = workspace.getConfiguration(ext.prefix, folder.uri).inspect<string>(preDeployTaskSetting)?.workspaceFolderValue;
        originalFetch = tasks.fetchTasks;
        originalExecute = tasks.executeTask;
        originalEnd = Object.getOwnPropertyDescriptor(tasks, 'onDidEndTaskProcess');
        originalExecutions = Object.getOwnPropertyDescriptor(tasks, 'taskExecutions');
        originalDialog = window.showErrorMessage;
        ending = new EventEmitter<TaskProcessEndEvent>();
        Object.defineProperty(tasks, 'onDidEndTaskProcess', { configurable: true, value: ending.event });
    });

    teardown(async () => {
        tasks.fetchTasks = originalFetch;
        tasks.executeTask = originalExecute;
        if (originalEnd) {
            Object.defineProperty(tasks, 'onDidEndTaskProcess', originalEnd);
        } else {
            Reflect.deleteProperty(tasks, 'onDidEndTaskProcess');
        }
        if (originalExecutions) {
            Object.defineProperty(tasks, 'taskExecutions', originalExecutions);
        } else {
            Reflect.deleteProperty(tasks, 'taskExecutions');
        }
        window.showErrorMessage = originalDialog;
        ending.dispose();
        await workspace.getConfiguration(ext.prefix, folder.uri).update(preDeployTaskSetting, oldTask, ConfigurationTarget.WorkspaceFolder);
    });

    async function runTask(
        exitCodes: number[], response: string | undefined, taskName = packTaskName,
        options: { missingTask?: boolean; missingRetryTask?: boolean; activeRetryTask?: boolean } = {},
    ): Promise<{ context: IDeployContext; invocations: number }> {
        const context: IDeployContext = Object.assign(await createTestActionContext(), {
            workspaceFolder: folder,
            originalDeployFsPath: folder.uri.fsPath,
            effectiveDeployFsPath: folder.uri.fsPath,
            defaultAppSetting: 'defaultFunctionAppToDeploy',
        });
        initializeWorkflowTelemetry(context, { workflow: 'deploy', command: 'deploy' });
        await workspace.getConfiguration(ext.prefix, folder.uri).update(preDeployTaskSetting, taskName, ConfigurationTarget.WorkspaceFolder);
        let invocations = 0;
        tasks.fetchTasks = async () => (options.missingTask ? [] : options.missingRetryTask ? [taskName] : [taskName, `${packTaskName} --build-native-deps`])
            .map(name => new Task({ type: 'shell' }, folder, name, 'test', new ShellExecution('unused')));
        tasks.executeTask = async task => {
            const execution = { task, terminate: () => undefined };
            const exitCode = exitCodes[invocations++];
            assert.notStrictEqual(exitCode, undefined, 'Unexpected additional task invocation.');
            setImmediate(() => ending.fire({ execution, exitCode }));
            return execution;
        };
        if (options.activeRetryTask) {
            Object.defineProperty(tasks, 'taskExecutions', {
                configurable: true,
                get: () => {
                    if (invocations !== 1) {
                        return [];
                    }
                    const task = new Task({ type: 'shell' }, folder, `${packTaskName} --build-native-deps`, 'test', new ShellExecution('unused'));
                    const execution = { task, terminate: () => undefined };
                    setImmediate(() => ending.fire({ execution, exitCode: 0 }));
                    return [execution];
                },
            });
        }
        window.showErrorMessage = (async (_message: string, _options: unknown, ...items: { title: string }[]) => {
            await new Promise(resolve => setTimeout(resolve, 15));
            return items.find(item => item.title === response);
        }) as typeof window.showErrorMessage;

        const execution = runWithFuncSetting('validateFuncCoreTools', false, async () =>
            runWithTelemetryContext(context, async () => runPreDeployTask(context, folder.uri.fsPath, undefined)));
        if (options.missingTask || options.missingRetryTask) {
            await assert.rejects(execution, /Failed to find preDeploy task/);
        } else {
            await execution;
        }
        return { context, invocations };
    }

    test('a missing configured task is blocked and never reports a process invocation', async () => {
        const { context, invocations } = await runTask([], undefined, 'missing test build', { missingTask: true });
        assert.strictEqual(invocations, 0);
        assert.strictEqual(context.telemetry.properties.outcome, 'blocked');
        assert.strictEqual(context.telemetry.properties.failureCode, 'preDeployTaskMissing');
        assert.strictEqual(context.telemetry.measurements.retryCount, undefined);
        assert.strictEqual(context.telemetry.properties.userWaitTiming, 'unavailable');
        assert.strictEqual(context.telemetry.measurements.userWaitDuration, undefined);
    });

    test('a missing native-dependency task is blocked without counting a requested retry', async () => {
        const { context, invocations } = await runTask([4], 'Yes', packTaskName, { missingRetryTask: true });
        assert.strictEqual(invocations, 1);
        assert.strictEqual(context.telemetry.properties.outcome, 'blocked');
        assert.strictEqual(context.telemetry.properties.failureCode, 'preDeployTaskMissing');
        assert.strictEqual(context.telemetry.measurements.retryCount, undefined);
        assert.notStrictEqual(context.telemetry.properties.recoveredAfterRetry, 'true');
    });

    test('an already-active native-dependency task does not count as another invocation', async () => {
        const { context, invocations } = await runTask([4], 'Yes', packTaskName, { activeRetryTask: true });
        assert.strictEqual(invocations, 1);
        assert.strictEqual(context.telemetry.properties.outcome, 'succeeded');
        assert.strictEqual(context.telemetry.measurements.retryCount, undefined);
        assert.notStrictEqual(context.telemetry.properties.recoveredAfterRetry, 'true');
    });

    test('native-dependency recovery records one actual retry and observed dialog wait', async () => {
        const { context, invocations } = await runTask([4, 0], 'Yes');
        const { properties, measurements } = context.telemetry;
        assert.strictEqual(invocations, 2);
        assert.strictEqual(properties.outcome, 'succeeded');
        assert.strictEqual(properties.recoveredAfterRetry, 'true');
        assert.strictEqual(measurements.retryCount, 1);
        assert.strictEqual(properties.userWaitTiming, 'available');
        assert.ok(typeof measurements.userWaitDuration === 'number' && measurements.userWaitDuration > 0);
        assert.ok(typeof measurements.activeDuration === 'number');
        assert.ok(typeof measurements.workflowDuration === 'number');
        assert.ok(Math.abs(measurements.activeDuration + measurements.userWaitDuration - measurements.workflowDuration) < 0.001);
    });

    test('declining native-dependency recovery is a task failure, not a pure cancellation', async () => {
        const { context, invocations } = await runTask([4], undefined);
        assert.strictEqual(invocations, 1);
        assert.strictEqual(context.telemetry.properties.result, 'Canceled');
        assert.strictEqual(context.telemetry.properties.outcome, 'failed');
        assert.strictEqual(context.telemetry.properties.failureCode, 'preDeployTaskFailed');
        assert.strictEqual(context.telemetry.measurements.retryCount, undefined);
        assert.notStrictEqual(context.telemetry.properties.recoveredAfterRetry, 'true');
    });

    test('a failed native-dependency retry does not claim recovery', async () => {
        const { context, invocations } = await runTask([4, 1], 'Yes');
        assert.strictEqual(invocations, 2);
        assert.strictEqual(context.telemetry.properties.outcome, 'failed');
        assert.strictEqual(context.telemetry.measurements.retryCount, 1);
        assert.notStrictEqual(context.telemetry.properties.recoveredAfterRetry, 'true');
    });

    for (const response of ['Deploy Anyway', undefined]) {
        test(`failed task ${response ?? 'dismissal'} preserves its actual workflow outcome`, async () => {
            const { context, invocations } = await runTask([1], response, 'test build');
            assert.strictEqual(invocations, 1);
            assert.strictEqual(context.telemetry.properties.outcome, response ? 'succeeded' : 'failed');
            assert.strictEqual(context.telemetry.properties.result, response ? 'Succeeded' : 'Canceled');
        });
    }
});
