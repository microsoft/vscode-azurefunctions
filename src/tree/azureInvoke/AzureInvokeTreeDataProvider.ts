/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type InvocationCollection } from '../../azureInvoke/InvocationCollection';
import { type ChainInvocationRunner } from '../../azureInvoke/invocationRunner/ChainInvocationRunner';
import { InvocationGroupItem } from './InvocationGroupItem';
import { InvocationItem } from './InvocationItem';

export type AzureInvokeTreeElement = InvocationItem | InvocationGroupItem;

/** The Invoke view. Renders the collection with run status and refreshes when either changes. */
export class AzureInvokeTreeDataProvider implements vscode.TreeDataProvider<AzureInvokeTreeElement>, vscode.Disposable {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    private readonly disposables: vscode.Disposable[];

    public constructor(
        private readonly collection: InvocationCollection,
        private readonly chainRunner: ChainInvocationRunner,
    ) {
        this.disposables = [
            this.onDidChangeTreeDataEmitter,
            collection.onDidChange(() => this.refresh()),
            chainRunner.onDidChangeStatus(() => this.refresh()),
        ];
    }

    public getChildren(element?: AzureInvokeTreeElement): AzureInvokeTreeElement[] {
        if (!element) {
            return this.getRootItems();
        }
        // Only folders have children. Invocations are leaves.
        return element instanceof InvocationGroupItem ? element.getChildren() : [];
    }

    public getTreeItem(element: AzureInvokeTreeElement): vscode.TreeItem {
        return element.getTreeItem();
    }

    public refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }

    /**
     * Lists ungrouped invocations first, then folders in first-seen order.
     */
    private getRootItems(): AzureInvokeTreeElement[] {
        const ungrouped: InvocationItem[] = [];
        const groups = new Map<string, InvocationItem[]>();
        for (const invocation of this.collection.list()) {
            const item = new InvocationItem(invocation.id, invocation.name, this.chainRunner.getStatus(invocation.id));
            if (!invocation.group) {
                ungrouped.push(item);
                continue;
            }
            let children = groups.get(invocation.group);
            if (!children) {
                children = [];
                groups.set(invocation.group, children);
            }
            children.push(item);
        }
        const folders = Array.from(groups, ([name, children]) => new InvocationGroupItem(name, children));
        return [...ungrouped, ...folders];
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose();
    }
}
