/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { type HttpInvocation } from '../../webviews/azureInvoke/shared/httpRequest';
import { copyInvocation, validateInvocation } from './invocationCollection';

export class AzureInvokeTreeDataProvider implements vscode.TreeDataProvider<HttpInvocation>, vscode.Disposable {
    private readonly requests = new Map<string, HttpInvocation>();
    private readonly changeEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeTreeData = this.changeEmitter.event;
    private requestNumber = 0;

    public createRequest(): HttpInvocation {
        return {
            id: randomUUID(),
            name: localize('azureInvoke.httpRequest', 'HTTP request {0}', ++this.requestNumber),
            request: { method: 'GET', url: '', headers: [], query: [], body: '' },
        };
    }

    public saveRequest(invocation: HttpInvocation): void {
        validateInvocation(invocation);
        this.requests.set(invocation.id, copyInvocation(invocation));
        this.changeEmitter.fire();
    }

    public getRequest(id: string): HttpInvocation | undefined {
        const invocation = this.requests.get(id);
        return invocation && copyInvocation(invocation);
    }

    public replaceRequests(invocations: readonly HttpInvocation[]): void {
        invocations.forEach(validateInvocation);
        if (new Set(invocations.map(invocation => invocation.id)).size !== invocations.length) {
            throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
        }
        this.requests.clear();
        for (const invocation of invocations) {
            this.requests.set(invocation.id, copyInvocation(invocation));
        }
        this.changeEmitter.fire();
    }

    public getChildren(element?: HttpInvocation): HttpInvocation[] {
        return element ? [] : [...this.requests.values()];
    }

    public getTreeItem(request: HttpInvocation): vscode.TreeItem {
        const item = new vscode.TreeItem(request.name, vscode.TreeItemCollapsibleState.None);
        item.id = request.id;
        item.iconPath = new vscode.ThemeIcon('globe');
        item.command = {
            command: 'azureFunctions.azureInvoke.open',
            title: localize('azureInvoke.open', 'Open HTTP Request'),
            arguments: [{ id: request.id }],
        };
        return item;
    }

    public dispose(): void {
        this.requests.clear();
        this.changeEmitter.dispose();
    }
}
