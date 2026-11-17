/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, callWithTelemetryAndErrorHandling, initializeWorkflowTelemetry, type IActionContext } from '@microsoft/vscode-azext-utils';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { Uri, window, workspace, type Memento } from 'vscode';
import { ext } from '../../extensionVariables';
import { isPathEqual } from '../../utils/fs';
import { getContainingWorkspace } from '../../utils/workspace';

interface ICachedFunction {
    projectPath: string;
    newFilePath: string;
    isHttpTrigger: boolean;
    isMcpTrigger: boolean;
    expectedWorkspaceRoot?: string;
    cacheId?: string;
    workflowCorrelation?: ICachedWorkflowCorrelation;
}

interface ICachedWorkflowCorrelation {
    workflowRunId: string;
    parentAttemptId: string;
}

const cacheKey: string = 'azFuncPostFunctionCreate';

function isWorkflowCorrelation(value: unknown): value is ICachedWorkflowCorrelation {
    if (!value || typeof value !== 'object' || !('workflowRunId' in value) || !('parentAttemptId' in value)) {
        return false;
    }

    const generatedId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    return [value.workflowRunId, value.parentAttemptId].every(id =>
        typeof id === 'string' && id.length === 36 && generatedId.test(id));
}

export async function cachePostFunctionCreateSteps(func: ICachedFunction, clearAfterTimeout = true, parentContext?: IActionContext): Promise<void> {
    // Opening a folder can restart the extension host; activation consumes this cache.
    const state = ext.context.globalState;
    const correlation = {
        workflowRunId: parentContext?.telemetry.properties.workflowRunId,
        parentAttemptId: parentContext?.telemetry.properties.attemptId,
    };
    const cachedFunc = {
        ...func,
        ...(isWorkflowCorrelation(correlation) ? { workflowCorrelation: correlation } : {}),
        cacheId: randomUUID(),
    };
    await state.update(cacheKey, cachedFunc);
    if (clearAfterTimeout) {
        setTimeout(() => { void clearCachedFunction(state, cachedFunc); }, 5 * 1000);
    }
}

export async function runPostFunctionCreateStepsFromCache(): Promise<void> {
    const state = ext.context.globalState;
    const cachedFunc: ICachedFunction | undefined = state.get(cacheKey);
    const expectedWorkspaceRoot = cachedFunc?.expectedWorkspaceRoot;
    const workspaceMatches = cachedFunc && (expectedWorkspaceRoot ?
        workspace.workspaceFolders?.some(folder => isPathEqual(folder.uri.fsPath, expectedWorkspaceRoot)) :
        !!getContainingWorkspace(cachedFunc.projectPath));
    if (cachedFunc && workspaceMatches) {
        try {
            await runPostFunctionCreateSteps(cachedFunc);
        } finally {
            await clearCachedFunction(state, cachedFunc);
        }
    }
}

async function clearCachedFunction(state: Memento, cachedFunc: ICachedFunction): Promise<void> {
    if (state.get<ICachedFunction>(cacheKey)?.cacheId === cachedFunc.cacheId) {
        await state.update(cacheKey, undefined);
    }
}

export async function openCreatedFunction(func: ICachedFunction, cache: boolean, parentContext?: IActionContext): Promise<void> {
    if (cache) {
        await cachePostFunctionCreateSteps(func, true, parentContext);
    }
    await runPostFunctionCreateSteps(func, parentContext);
}

export async function runPostFunctionCreateSteps(func: ICachedFunction, parentContext?: IActionContext): Promise<void> {
    await callWithTelemetryAndErrorHandling('postFunctionCreate', async (context: IActionContext) => {
        if (parentContext?.telemetry.properties.workflowRunId) {
            initializeWorkflowTelemetry(context, { workflow: 'createProject', command: 'unknown' }, parentContext);
            context.valuesToMask.push(...parentContext.valuesToMask);
        } else if (isWorkflowCorrelation(func.workflowCorrelation)) {
            context.telemetry.properties.workflowRunId = func.workflowCorrelation.workflowRunId;
            context.telemetry.properties.parentAttemptId = func.workflowCorrelation.parentAttemptId;
            context.telemetry.properties.isWorkflowRoot = 'false';
        }
        context.telemetry.suppressIfSuccessful = true;
        const mcpJsonFilePath: string = path.join(func.projectPath, '.vscode', 'mcp.json');
        context.valuesToMask.push(func.projectPath, func.newFilePath, mcpJsonFilePath);

        if (func.newFilePath && getContainingWorkspace(func.projectPath)) {
            if (await AzExtFsExtra.pathExists(func.newFilePath) && await AzExtFsExtra.pathExists(mcpJsonFilePath) && func.isMcpTrigger) {
                const templateFile = await workspace.openTextDocument(Uri.file(func.newFilePath));
                const mcpJsonFile = await workspace.openTextDocument(Uri.file(mcpJsonFilePath));
                await window.showTextDocument(templateFile, { viewColumn: 1, preserveFocus: false });
                await window.showTextDocument(mcpJsonFile, { viewColumn: 2, preserveFocus: true });
            }
            else if (await AzExtFsExtra.pathExists(func.newFilePath)) {
                await window.showTextDocument(await workspace.openTextDocument(Uri.file(func.newFilePath)));
            }
        }
    });
}
