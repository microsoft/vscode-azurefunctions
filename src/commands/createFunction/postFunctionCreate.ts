/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { Uri, window, workspace, type Memento } from 'vscode';
import { ext } from '../../extensionVariables';
import { getContainingWorkspace } from '../../utils/workspace';

interface ICachedFunction {
    projectPath: string;
    newFilePath: string;
    isHttpTrigger: boolean;
    isMcpTrigger: boolean;
    cacheId?: string;
}

const cacheKey: string = 'azFuncPostFunctionCreate';

export async function cachePostFunctionCreateSteps(func: ICachedFunction, clearAfterTimeout = true): Promise<void> {
    // Opening a folder can restart the extension host; activation consumes this cache.
    const state = ext.context.globalState;
    const cachedFunc = { ...func, cacheId: randomUUID() };
    await state.update(cacheKey, cachedFunc);
    if (clearAfterTimeout) {
        setTimeout(() => { void clearCachedFunction(state, cachedFunc); }, 5 * 1000);
    }
}

export async function runPostFunctionCreateStepsFromCache(): Promise<void> {
    const state = ext.context.globalState;
    const cachedFunc: ICachedFunction | undefined = state.get(cacheKey);
    if (cachedFunc && getContainingWorkspace(cachedFunc.projectPath)) {
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

export async function runPostFunctionCreateSteps(func: ICachedFunction): Promise<void> {
    await callWithTelemetryAndErrorHandling('postFunctionCreate', async (context: IActionContext) => {
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
