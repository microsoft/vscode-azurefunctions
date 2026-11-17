/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type InvocationRunStatus } from '../../azureInvoke/HttpInvocationRunner';
import { localize } from '../../localize';

/**
 * A saved HTTP invocation. Holds only its ID, name, and run status, so passing
 * the item as a command argument never exposes request data.
 */
export class InvocationItem {
    public static readonly contextValue: string = 'azureInvoke.http';

    public constructor(
        public readonly id: string,
        public readonly name: string,
        private readonly status?: InvocationRunStatus,
    ) { }

    public getTreeItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.None);
        item.id = `request:${this.id}`;
        item.contextValue = InvocationItem.contextValue;
        item.iconPath = this.getIcon();
        const trigger = localize('azureInvoke.httpTriggerDescription', 'HTTP Trigger');
        item.description = this.status ? localize('azureInvoke.triggerLastRun', '{0} ({1})', trigger, this.status.lastRun.toLocaleTimeString()) : trigger;
        item.tooltip = this.status ?
            `${localize('azureInvoke.lastRun', 'Last run: {0}', this.status.lastRun.toLocaleString())}\n${this.getStatusText(this.status)}` :
            localize('azureInvoke.notRun', 'Not run yet');
        item.command = {
            command: 'azureFunctions.azureInvoke.open',
            title: localize('azureInvoke.openInvocation', 'Open Invocation'),
            arguments: [this],
        };
        return item;
    }

    public getChildren(): [] {
        return [];
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.status?.state) {
            case undefined:
                return new vscode.ThemeIcon('circle-outline');
            case 'running':
                return new vscode.ThemeIcon('loading~spin');
            case 'succeeded':
                return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
            case 'failed':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            case 'blocked':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
            case 'cancelled':
                return new vscode.ThemeIcon('circle-slash');
        }
    }

    private getStatusText(status: InvocationRunStatus): string {
        if (status.statusCode !== undefined) {
            return localize('azureInvoke.resultStatus', '{0}, {1} ms', status.statusCode, status.duration);
        }
        switch (status.state) {
            case 'running':
                return localize('azureInvoke.running', 'Running...');
            case 'blocked':
                return localize('azureInvoke.requestBlocked', 'Not run: a prerequisite has no successful result');
            case 'cancelled':
                return localize('azureInvoke.requestCancelled', 'Cancelled');
            default:
                return localize('azureInvoke.requestFailedStatus', 'Failed');
        }
    }
}
