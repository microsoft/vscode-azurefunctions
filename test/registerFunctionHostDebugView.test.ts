/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { FuncHostDebugViewProvider, type IHostErrorNode, type IHostTaskNode } from '../extension.bundle';

suite('FuncHostDebugViewProvider', () => {
    let provider: FuncHostDebugViewProvider;

    setup(() => {
        provider = new FuncHostDebugViewProvider();
    });

    suite('getTreeItem', () => {
        test('returns no host tree item when kind is noHost', () => {
            const node = { kind: 'noHost' as const };
            const treeItem = provider.getTreeItem(node);

            assert.ok(treeItem);
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
            assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
            assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'debug');
        });

        test('returns host task tree item when kind is hostTask', () => {
            const mockFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'TestWorkspace',
                index: 0
            };

            const node: IHostTaskNode = {
                kind: 'hostTask',
                workspaceFolder: mockFolder,
                portNumber: '7071'
            };

            const treeItem = provider.getTreeItem(node);

            assert.ok(treeItem);
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
            assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'server-process');
            assert.strictEqual(treeItem.description, 'TestWorkspace');
            assert.ok(treeItem.label?.toString().includes('7071'));
        });

        test('returns host task tree item with cwd when provided', () => {
            const mockFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'TestWorkspace',
                index: 0
            };

            const node: IHostTaskNode = {
                kind: 'hostTask',
                workspaceFolder: mockFolder,
                portNumber: '7071',
                cwd: '/test/workspace/subfolder'
            };

            const treeItem = provider.getTreeItem(node);

            assert.ok(treeItem);
            assert.ok(treeItem.tooltip instanceof vscode.MarkdownString);
            const tooltip = (treeItem.tooltip as vscode.MarkdownString).value;
            assert.ok(tooltip.includes('/test/workspace/subfolder'));
        });

        test('returns host error tree item when kind is hostError', () => {
            const mockFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'TestWorkspace',
                index: 0
            };

            const node: IHostErrorNode = {
                kind: 'hostError',
                workspaceFolder: mockFolder,
                portNumber: '7071',
                message: 'Test error message\nwith multiple lines'
            };

            const treeItem = provider.getTreeItem(node);

            assert.ok(treeItem);
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
            assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
            assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'error');
            assert.strictEqual(treeItem.tooltip, 'Test error message\nwith multiple lines');
            assert.strictEqual(treeItem.label, 'Test error message');
        });

        test('handles empty error message gracefully', () => {
            const mockFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'TestWorkspace',
                index: 0
            };

            const node: IHostErrorNode = {
                kind: 'hostError',
                workspaceFolder: mockFolder,
                portNumber: '7071',
                message: ''
            };

            const treeItem = provider.getTreeItem(node);

            assert.ok(treeItem);
            assert.ok(treeItem.label); // Should have a default label
        });

        test('handles multiline error message and extracts first line', () => {
            const mockFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'TestWorkspace',
                index: 0
            };

            const node: IHostErrorNode = {
                kind: 'hostError',
                workspaceFolder: mockFolder,
                portNumber: '7071',
                message: 'First line of error\nSecond line\nThird line'
            };

            const treeItem = provider.getTreeItem(node);

            assert.ok(treeItem);
            assert.strictEqual(treeItem.label, 'First line of error');
            assert.strictEqual(treeItem.tooltip, 'First line of error\nSecond line\nThird line');
        });

        test('returns host task tree item with global scope', () => {
            const node: IHostTaskNode = {
                kind: 'hostTask',
                workspaceFolder: vscode.TaskScope.Global,
                portNumber: '7072'
            };

            const treeItem = provider.getTreeItem(node);

            assert.ok(treeItem);
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            assert.ok(treeItem.label?.toString().includes('7072'));
        });
    });

    suite('getChildren', () => {
        test('returns empty array for noHost element', async () => {
            const node = { kind: 'noHost' as const };
            const children = await provider.getChildren(node);

            assert.strictEqual(children.length, 0);
        });

        test('returns empty array for hostError element', async () => {
            const mockFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/test/workspace'),
                name: 'TestWorkspace',
                index: 0
            };

            const node: IHostErrorNode = {
                kind: 'hostError',
                workspaceFolder: mockFolder,
                portNumber: '7071',
                message: 'Test error'
            };

            const children = await provider.getChildren(node);

            assert.strictEqual(children.length, 0);
        });
    });

    suite('refresh', () => {
        test('fires onDidChangeTreeData event', (done) => {
            provider.onDidChangeTreeData(() => {
                done();
            });

            provider.refresh();
        });

        test('fires onDidChangeTreeData with undefined element', (done) => {
            provider.onDidChangeTreeData((element) => {
                assert.strictEqual(element, undefined);
                done();
            });

            provider.refresh();
        });
    });
});
