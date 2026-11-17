/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type InvocationItem } from './InvocationItem';

/** A folder for invocations that share a group name. */
export class InvocationGroupItem {
    public constructor(
        public readonly name: string,
        private readonly children: InvocationItem[],
    ) { }

    public getTreeItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.Expanded);
        item.id = `group:${this.name}`;
        item.iconPath = new vscode.ThemeIcon('folder');
        return item;
    }

    public getChildren(): InvocationItem[] {
        return this.children;
    }
}
