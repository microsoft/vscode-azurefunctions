/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';

export interface InvocationDebugSession {
    readonly id: string;
    readonly workspaceFolder?: string;
}

export function resolveInvocationDebugSession(_context: IActionContext): Promise<InvocationDebugSession> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        throw new Error(localize('azureInvoke.debugSessionRequired', 'Start your local application in the VS Code debugger, then select Debug with Copilot again.'));
    }
    return Promise.resolve({ id: session.id, workspaceFolder: session.workspaceFolder?.uri.fsPath });
}
