/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { localize } from '../../localize';

enum FuncHostDebugContextValue {
    HostError = 'azFunc.funcHostDebug.hostError',
}

export class HostErrorNode {
    public readonly kind = 'hostError' as const;

    constructor(
        public readonly workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope,
        public readonly portNumber: string,
        public readonly message: string,
        public readonly cwd?: string,
    ) { }

    public getTreeItem(): vscode.TreeItem {
        const firstLine = this.message.split(/\r?\n/)[0].trim();
        const label = firstLine || localize('funcHostDebug.errorDetected', 'Error detected');

        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('error');
        item.tooltip = this.message;
        item.contextValue = FuncHostDebugContextValue.HostError;
        return item;
    }

    public getChildren(): never[] {
        return [];
    }
}
