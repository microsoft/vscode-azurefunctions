/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext, initializeWorkflowTelemetry, registerOnActionStartHandler, registerTelemetryHandler, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace, type Disposable } from 'vscode';
import { FunctionCreateStepBase, runPostFunctionCreateStepsFromCache } from '../../src/commands/createFunction/FunctionCreateStepBase';
import { type IFunctionWizardContext } from '../../src/commands/createFunction/IFunctionWizardContext';
import { cachePostFunctionCreateSteps } from '../../src/commands/createFunction/postFunctionCreate';
import { ProjectLanguage } from '../../src/constants';
import { ext } from '../../src/extensionVariables';
import { FuncVersion } from '../../src/FuncVersion';
import { TemplateSchemaVersion } from '../../src/templates/TemplateProviderBase';
import { createActivityContext } from '../../src/utils/activityUtils';
import { runWithTelemetryContext } from '../utils/runWithTelemetryContext';
import { getTestApi } from '../utils/testApiAccess';

suite('Post-function creation restart correlation', () => {
    const cacheKey = 'azFuncPostFunctionCreate';
    const workflowRunId = '12345678-1234-1234-1234-123456789abc';
    const parentAttemptId = 'abcdef12-1234-1234-1234-123456789abc';
    let originalOpenDocument: typeof workspace.openTextDocument;
    let actionHandler: Disposable;
    let projectPath: string;
    let tempPath: string;
    let newFilePath: string;

    suiteSetup(async () => {
        const context = (await getTestApi()).extensionVariables.getContext();
        assert.ok(context);
        ext.context = context;
    });

    setup(async () => {
        assert.ok(workspace.workspaceFolders?.[0]);
        projectPath = workspace.workspaceFolders[0].uri.fsPath;
        tempPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc post-create '));
        newFilePath = path.join(tempPath, 'function.js');
        await fs.promises.writeFile(newFilePath, '');
        originalOpenDocument = workspace.openTextDocument;
        workspace.openTextDocument = async () => { throw new Error('test post-create editor failure'); };
        actionHandler = registerOnActionStartHandler(context => {
            if (context.callbackId === 'postFunctionCreate') {
                context.errorHandling.suppressDisplay = true;
            }
        });
    });

    teardown(async () => {
        workspace.openTextDocument = originalOpenDocument;
        actionHandler.dispose();
        await ext.context.globalState.update(cacheKey, undefined);
        await AzExtFsExtra.deleteResource(tempPath, { recursive: true, useTrash: false });
    });

    async function capturePostCreate(callback: () => Promise<void>): Promise<IActionContext> {
        let complete: ((context: IActionContext) => void) | undefined;
        const completed = new Promise<IActionContext>(resolve => { complete = resolve; });
        const telemetry = registerTelemetryHandler(context => {
            if (context.callbackId === 'postFunctionCreate') {
                complete?.(context);
            }
        });
        try {
            await callback();
            return await completed;
        } finally {
            telemetry.dispose();
        }
    }

    async function replay(workflowCorrelation?: unknown): Promise<IActionContext> {
        await ext.context.globalState.update(cacheKey, {
            projectPath, newFilePath, isHttpTrigger: true, isMcpTrigger: false, workflowCorrelation,
        });
        const context = await capturePostCreate(runPostFunctionCreateStepsFromCache);
        assert.strictEqual(ext.context.globalState.get(cacheKey), undefined);
        assert.strictEqual(context.telemetry.properties.result, 'Failed');
        return context;
    }

    test('persists only generated correlation IDs and links a failed replay without resuming the root', async () => {
        const context: IFunctionWizardContext = Object.assign(await createTestActionContext(), await createActivityContext(), {
            projectPath, workspacePath: projectPath, workspaceFolder: undefined,
            version: FuncVersion.v4, language: ProjectLanguage.JavaScript, projectTemplateKey: undefined,
            openBehavior: 'OpenInCurrentWindow' as const,
            functionTemplate: {
                id: 'testHttpTrigger', name: 'HttpTrigger', language: ProjectLanguage.JavaScript,
                isHttpTrigger: true, isTimerTrigger: false, isMcpTrigger: false, templateSchemaVersion: TemplateSchemaVersion.v1,
            },
        });
        initializeWorkflowTelemetry(context, { workflow: 'createProject', command: 'createNewProject' });
        context.telemetry.properties.privateTestValue = 'must-not-be-cached';
        context.valuesToMask.push('must-not-be-cached');
        class FunctionStep extends FunctionCreateStepBase<IFunctionWizardContext> {
            public async executeCore(): Promise<string> { return newFilePath; }
        }
        const liveChild = await capturePostCreate(async () =>
            runWithTelemetryContext(context, async () => new FunctionStep().execute(context, { report: () => undefined })));
        assert.strictEqual(liveChild.telemetry.properties.workflowRunId, context.telemetry.properties.workflowRunId);
        assert.strictEqual(liveChild.telemetry.properties.outcome, 'failed');

        const cached = ext.context.globalState.get(cacheKey);
        assert.ok(cached);
        assert.deepStrictEqual(Object.keys(cached).sort(), [
            'cacheId', 'isHttpTrigger', 'isMcpTrigger', 'newFilePath', 'projectPath', 'workflowCorrelation',
        ]);
        assert.ok(!JSON.stringify(cached).includes('must-not-be-cached'));
        const persisted: unknown = JSON.parse(JSON.stringify(cached));
        await ext.context.globalState.update(cacheKey, persisted);
        const rootSnapshot = JSON.stringify(context.telemetry);
        const replayed = await capturePostCreate(runPostFunctionCreateStepsFromCache);

        assert.strictEqual(replayed.telemetry.properties.result, 'Failed');
        assert.strictEqual(replayed.telemetry.properties.workflowRunId, context.telemetry.properties.workflowRunId);
        assert.strictEqual(replayed.telemetry.properties.parentAttemptId, context.telemetry.properties.attemptId);
        assert.strictEqual(replayed.telemetry.properties.isWorkflowRoot, 'false');
        assert.strictEqual(replayed.telemetry.properties.workflowSchemaVersion, undefined);
        assert.strictEqual(replayed.telemetry.properties.outcome, undefined);
        assert.strictEqual(replayed.telemetry.measurements.workflowDuration, undefined);
        assert.strictEqual(replayed.telemetry.measurements.activeDuration, undefined);
        assert.strictEqual(replayed.telemetry.measurements.userWaitDuration, undefined);
        assert.strictEqual(JSON.stringify(context.telemetry), rootSnapshot);
        assert.strictEqual(ext.context.globalState.get(cacheKey), undefined);
    });

    test('retains workflow correlation when a new-window action is cached', async () => {
        const context = await createTestActionContext();
        initializeWorkflowTelemetry(context, { workflow: 'createProject', command: 'templateGallery.createProject' });
        await cachePostFunctionCreateSteps({
            projectPath, newFilePath, isHttpTrigger: false, isMcpTrigger: false, expectedWorkspaceRoot: projectPath,
        }, false, context);

        const replayed = await capturePostCreate(runPostFunctionCreateStepsFromCache);

        assert.strictEqual(replayed.telemetry.properties.workflowRunId, context.telemetry.properties.workflowRunId);
        assert.strictEqual(replayed.telemetry.properties.parentAttemptId, context.telemetry.properties.attemptId);
        assert.strictEqual(ext.context.globalState.get(cacheKey), undefined);
    });

    test('restores valid IDs from persisted cache data', async () => {
        const context = await replay({ workflowRunId, parentAttemptId, arbitraryValue: 'must-not-be-emitted' });
        assert.strictEqual(context.telemetry.properties.workflowRunId, workflowRunId);
        assert.strictEqual(context.telemetry.properties.parentAttemptId, parentAttemptId);
        assert.strictEqual(context.telemetry.properties.isWorkflowRoot, 'false');
        assert.ok(!JSON.stringify(context.telemetry).includes('must-not-be-emitted'));
    });

    for (const [name, correlation] of [
        ['legacy', undefined],
        ['null', null],
        ['non-object', 'not-correlation'],
        ['missing ID', { workflowRunId }],
        ['invalid workflow ID', { workflowRunId: 'private-workspace-path', parentAttemptId }],
        ['invalid parent ID', { workflowRunId, parentAttemptId: 'private-resource-name' }],
        ['non-string ID', { workflowRunId, parentAttemptId: 123 }],
        ['workflow ID with trailing newline', { workflowRunId: `${workflowRunId}\n`, parentAttemptId }],
        ['parent ID with trailing newline', { workflowRunId, parentAttemptId: `${parentAttemptId}\n` }],
    ] as const) {
        test(`${name} cache remains readable without emitting invalid correlation`, async () => {
            const context = await replay(correlation);
            assert.strictEqual(context.telemetry.properties.workflowRunId, undefined);
            assert.strictEqual(context.telemetry.properties.parentAttemptId, undefined);
            assert.strictEqual(context.telemetry.properties.isWorkflowRoot, undefined);
            assert.ok(!JSON.stringify(context.telemetry).includes('private-workspace-path'));
            assert.ok(!JSON.stringify(context.telemetry).includes('private-resource-name'));
        });
    }
});
