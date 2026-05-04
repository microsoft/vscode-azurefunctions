/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { localize } from '../../localize';

export class NoHostNode {
    public readonly kind = 'noHost' as const;

    public getTreeItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(localize('funcHostDebug.noneRunning', 'No Function Host task is currently running.'), vscode.TreeItemCollapsibleState.None);
        item.description = localize('funcHostDebug.startDebuggingHint', 'Start debugging (F5) to launch the host.');
        item.iconPath = new vscode.ThemeIcon('debug');
        return item;
    }

    public getChildren(): never[] {
        return [];
    }
}
