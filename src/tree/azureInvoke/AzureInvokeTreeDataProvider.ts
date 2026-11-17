/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type HttpInvocationRunner } from '../../azureInvoke/HttpInvocationRunner';
import { type InvocationCollection } from '../../azureInvoke/InvocationCollection';
import { InvocationGroupItem } from './InvocationGroupItem';
import { InvocationItem } from './InvocationItem';

export type AzureInvokeTreeElement = InvocationItem | InvocationGroupItem;

export class AzureInvokeTreeDataProvider implements vscode.TreeDataProvider<AzureInvokeTreeElement>, vscode.Disposable {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    private readonly disposables: vscode.Disposable[];

    public constructor(
        private readonly collection: InvocationCollection,
        private readonly runner: HttpInvocationRunner,
    ) {
        this.disposables = [
            this.onDidChangeTreeDataEmitter,
            collection.onDidChange(() => this.refresh()),
            runner.onDidChangeStatus(() => this.refresh()),
        ];
    }

    public getChildren(element?: AzureInvokeTreeElement): AzureInvokeTreeElement[] {
        return element ? element.getChildren() : this.getRootItems();
    }

    public getTreeItem(element: AzureInvokeTreeElement): vscode.TreeItem {
        return element.getTreeItem();
    }

    public refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }

    /** Lists ungrouped invocations and one folder per group, in the order each first appears. */
    private getRootItems(): AzureInvokeTreeElement[] {
        const roots: AzureInvokeTreeElement[] = [];
        const groups = new Map<string, InvocationItem[]>();
        for (const invocation of this.collection.list()) {
            const item = new InvocationItem(invocation.id, invocation.name, this.runner.getStatus(invocation.id));
            if (!invocation.group) {
                roots.push(item);
                continue;
            }
            let children = groups.get(invocation.group);
            if (!children) {
                children = [];
                groups.set(invocation.group, children);
                roots.push(new InvocationGroupItem(invocation.group, children));
            }
            children.push(item);
        }
        return roots;
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose();
    }
}
