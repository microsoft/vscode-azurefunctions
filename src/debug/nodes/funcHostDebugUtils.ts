/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { localize } from '../../localize';

export function formatTimestamp(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function getScopeLabel(scope: vscode.WorkspaceFolder | vscode.TaskScope): string {
    return typeof scope === 'object'
        ? scope.name
        : localize('funcHostDebug.globalScope', 'Global');
}

export function buildHostTooltip(opts: { label: string; scopeLabel: string; portNumber: string; startTime: Date; stopTime?: Date; cwd?: string; pid?: number }): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`**${opts.label}**\n\n`);
    tooltip.appendMarkdown(`- ${localize('funcHostDebug.workspace', 'Workspace')}: ${opts.scopeLabel}\n`);
    if (opts.pid !== undefined) {
        tooltip.appendMarkdown(`- ${localize('funcHostDebug.pid', 'PID')}: ${opts.pid}\n`);
    }
    tooltip.appendMarkdown(`- ${localize('funcHostDebug.port', 'Port')}: ${opts.portNumber}\n`);
    tooltip.appendMarkdown(`- ${localize('funcHostDebug.started', 'Started')}: ${opts.startTime.toLocaleString()}\n`);
    if (opts.stopTime) {
        tooltip.appendMarkdown(`- ${localize('funcHostDebug.stopped', 'Stopped')}: ${opts.stopTime.toLocaleString()}\n`);
    }
    if (opts.cwd) {
        tooltip.appendMarkdown(`- ${localize('funcHostDebug.cwd', 'CWD')}: ${opts.cwd}\n`);
    }
    return tooltip;
}
