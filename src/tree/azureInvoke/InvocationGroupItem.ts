/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type TreeElementBase } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { type InvocationItem } from './InvocationItem';

/** A folder for invocations that share a group name. */
export class InvocationGroupItem implements TreeElementBase {
    public constructor(
        public readonly name: string,
        private readonly children: InvocationItem[],
    ) { }

    public getTreeItem(): vscode.TreeItem {
        return {
            id: `group:${this.name}`,
            label: this.name,
            iconPath: new vscode.ThemeIcon('folder'),
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        };
    }

    public getChildren(): InvocationItem[] {
        return this.children;
    }
}
