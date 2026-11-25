/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type TreeElementBase } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { InvocationRunState, type InvocationRunStatus } from '../../azureInvoke/invocationRunner/InvocationRunStatus';
import { localize } from '../../localize';

/**
 * A saved HTTP invocation. Holds only its ID, name, and run status, so passing
 * the item as a command argument never exposes request data.
 */
export class InvocationItem implements TreeElementBase {
    public static readonly contextValue: string = 'azureInvoke.http';

    public constructor(
        public readonly id: string,
        public readonly name: string,
        private readonly status?: InvocationRunStatus,
    ) { }

    public getTreeItem(): vscode.TreeItem {
        const trigger = localize('azureInvoke.httpTriggerDescription', 'HTTP Trigger');
        return {
            id: `request:${this.id}`,
            label: this.name,
            contextValue: InvocationItem.contextValue,
            iconPath: this.getIcon(),
            description: this.status ? localize('azureInvoke.triggerLastRun', '{0} ({1})', trigger, this.status.lastRun.toLocaleTimeString()) : trigger,
            tooltip: this.status ?
                `${localize('azureInvoke.lastRun', 'Last run: {0}', this.status.lastRun.toLocaleString())}\n${this.getStatusText(this.status)}` :
                localize('azureInvoke.notRun', 'Not run yet'),
            command: {
                command: 'azureFunctions.azureInvoke.open',
                title: localize('azureInvoke.openInvocation', 'Open Invocation'),
                arguments: [this],
            },
        };
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.status?.state) {
            case undefined:
                return new vscode.ThemeIcon('circle-outline');
            case InvocationRunState.Running:
                return new vscode.ThemeIcon('loading~spin');
            case InvocationRunState.Succeeded:
                return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
            case InvocationRunState.Failed:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            case InvocationRunState.Blocked:
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
            case InvocationRunState.Cancelled:
                return new vscode.ThemeIcon('circle-slash');
        }
    }

    private getStatusText(status: InvocationRunStatus): string {
        if (status.statusCode !== undefined) {
            return localize('azureInvoke.resultStatus', '{0}, {1} ms', status.statusCode, status.duration);
        }
        switch (status.state) {
            case InvocationRunState.Running:
                return localize('azureInvoke.running', 'Running...');
            case InvocationRunState.Blocked:
                return localize('azureInvoke.requestBlocked', 'Not run: a prerequisite has no successful result');
            case InvocationRunState.Cancelled:
                return localize('azureInvoke.requestCancelled', 'Cancelled');
            default:
                return localize('azureInvoke.requestFailedStatus', 'Failed');
        }
    }
}
