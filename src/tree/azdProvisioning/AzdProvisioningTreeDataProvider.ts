/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Status of a provisioning resource or session.
 */
export enum ProvisioningStatus {
    InProgress = 'inProgress',
    Succeeded = 'succeeded',
    Failed = 'failed',
}

/**
 * Represents a single resource being provisioned.
 */
export interface ProvisioningResource {
    name: string;
    type?: string;
    status: ProvisioningStatus;
    message?: string;
}

/**
 * Represents a progress/info message from the azd output.
 */
export interface ProvisioningMessage {
    text: string;
    timestamp: Date;
    severity: 'info' | 'error';
}

/**
 * Represents an azd provisioning session (one `azd provision` invocation).
 */
export interface ProvisioningSession {
    id: string;
    label: string;
    status: ProvisioningStatus;
    startTime: Date;
    endTime?: Date;
    resources: Map<string, ProvisioningResource>;
    messages: ProvisioningMessage[];
}

type TreeElement = ProvisioningSession | ProvisioningResource | ProvisioningMessage;

/**
 * TreeDataProvider that shows azd provisioning sessions and their resources.
 *
 * Structure:
 *   Session "azd provision (12:34:56)"
 *     ├─ Provisioning Azure resources...  (info message)
 *     ├─ resourceGroup (Creating...)
 *     ├─ storageAccount (Succeeded)
 *     └─ functionApp (Creating...)
 */
export class AzdProvisioningTreeDataProvider implements vscode.TreeDataProvider<TreeElement>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly _sessions: ProvisioningSession[] = [];

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }

    // -- Public API used by the terminal listener --

    createSession(label?: string): ProvisioningSession {
        const now = new Date();
        const session: ProvisioningSession = {
            id: `session-${now.getTime()}`,
            label: label ?? `azd provision (${now.toLocaleTimeString()})`,
            status: ProvisioningStatus.InProgress,
            startTime: now,
            resources: new Map(),
            messages: [],
        };
        this._sessions.unshift(session); // newest first
        this._onDidChangeTreeData.fire(undefined);
        return session;
    }

    updateResource(session: ProvisioningSession, resourceName: string, status: ProvisioningStatus, resourceType?: string, message?: string): void {
        // Find existing resource: prefer exact type+name match, then fall back to name-only.
        // Linear scan is fine for the small number of resources in a provisioning session.
        let existing: ProvisioningResource | undefined;
        if (resourceType) {
            existing = [...session.resources.values()].find(r => r.name === resourceName && r.type === resourceType);
        }
        if (!existing) {
            existing = [...session.resources.values()].find(r => r.name === resourceName && !r.type);
        }

        if (existing) {
            existing.status = status;
            if (resourceType) existing.type = resourceType;
            if (message) existing.message = message;
        } else {
            // Use composite key so resources with the same name but different types don't collide
            const key = resourceType ? `${resourceType}|${resourceName}` : resourceName;
            session.resources.set(key, {
                name: resourceName,
                type: resourceType,
                status,
                message,
            });
        }
        this._onDidChangeTreeData.fire(session);
    }

    /**
     * Marks all resources that are still InProgress as the given status.
     * Used when azd reports overall SUCCESS or FAILURE to ensure every
     * pre-registered resource gets a final status, even if azd didn't
     * report on it individually.
     */
    markRemainingInProgressAs(session: ProvisioningSession, status: ProvisioningStatus, message: string): void {
        for (const resource of session.resources.values()) {
            if (resource.status === ProvisioningStatus.InProgress) {
                resource.status = status;
                resource.message = message;
            }
        }
        this._onDidChangeTreeData.fire(session);
    }

    addMessage(session: ProvisioningSession, text: string, severity: 'info' | 'error' = 'info'): void {
        session.messages.push({
            text,
            timestamp: new Date(),
            severity,
        });
        this._onDidChangeTreeData.fire(session);
    }

    completeSession(session: ProvisioningSession, status: ProvisioningStatus): void {
        session.status = status;
        session.endTime = new Date();
        this._onDidChangeTreeData.fire(session);
    }

    // -- TreeDataProvider implementation --

    getTreeItem(element: TreeElement): vscode.TreeItem {
        if (isSession(element)) {
            return this._getSessionTreeItem(element);
        }
        if (isMessage(element)) {
            return this._getMessageTreeItem(element);
        }
        return this._getResourceTreeItem(element);
    }

    getChildren(element?: TreeElement): TreeElement[] {
        if (!element) {
            return this._sessions;
        }
        if (isSession(element)) {
            return [...element.messages, ...element.resources.values()];
        }
        return [];
    }

    getParent(element: TreeElement): TreeElement | undefined {
        if (!isSession(element)) {
            // find the session that owns this resource or message
            return this._sessions.find(s =>
                [...s.resources.values()].includes(element as ProvisioningResource) ||
                s.messages.includes(element as ProvisioningMessage)
            );
        }
        return undefined;
    }

    private _getMessageTreeItem(message: ProvisioningMessage): vscode.TreeItem {
        const item = new vscode.TreeItem(message.text, vscode.TreeItemCollapsibleState.None);
        item.iconPath = message.severity === 'error'
            ? new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'))
            : new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.blue'));
        item.description = message.timestamp.toLocaleTimeString();
        item.contextValue = `azdProvisionMessage.${message.severity}`;
        return item;
    }

    private _getSessionTreeItem(session: ProvisioningSession): vscode.TreeItem {
        const hasChildren = session.resources.size > 0 || session.messages.length > 0;
        const item = new vscode.TreeItem(
            session.label,
            hasChildren
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None,
        );

        item.iconPath = statusToIcon(session.status);
        item.contextValue = `azdProvisionSession.${session.status}`;
        item.description = session.endTime
            ? `finished ${session.endTime.toLocaleTimeString()}`
            : 'running...';
        return item;
    }

    private _getResourceTreeItem(resource: ProvisioningResource): vscode.TreeItem {
        const label = resource.type ? `${resource.type}: ${resource.name}` : resource.name;
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);

        item.iconPath = statusToIcon(resource.status);
        item.description = resource.message ?? statusToDescription(resource.status);
        item.contextValue = `azdProvisionResource.${resource.status}`;
        return item;
    }
}

function isSession(element: TreeElement): element is ProvisioningSession {
    return 'resources' in element && element.resources instanceof Map;
}

function isMessage(element: TreeElement): element is ProvisioningMessage {
    return 'severity' in element && 'text' in element;
}

function statusToIcon(status: ProvisioningStatus): vscode.ThemeIcon {
    switch (status) {
        case ProvisioningStatus.InProgress:
            return new vscode.ThemeIcon('loading~spin');
        case ProvisioningStatus.Succeeded:
            return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
        case ProvisioningStatus.Failed:
            return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    }
}

function statusToDescription(status: ProvisioningStatus): string {
    switch (status) {
        case ProvisioningStatus.InProgress:
            return 'Creating...';
        case ProvisioningStatus.Succeeded:
            return 'Succeeded';
        case ProvisioningStatus.Failed:
            return 'Failed';
    }
}
