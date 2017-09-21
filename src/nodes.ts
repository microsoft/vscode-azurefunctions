/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'path';

import { AzureResourceFilter } from './azure-account.api';

export interface INode extends vscode.TreeItem {
    getChildren?(): Promise<INode[]>;
}

export class SubscriptionNode implements INode {
    readonly contextValue: string = 'azureFunctionsSubscription';
    readonly label: string;

    readonly collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private readonly subscriptionFilter: AzureResourceFilter) {
        if (subscriptionFilter.subscription.displayName) {
            this.label = subscriptionFilter.subscription.displayName;
        } else {
            // TODO
        }
    }

    get iconPath(): any {
        return {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'AzureSubscription.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'AzureSubscription.svg')
        };
    }
}

export class LoadingNode implements INode {
    readonly contextValue: string = 'azureFunctionsLoading';
    readonly label: string = "Loading...";
}

export class NoSubscriptionsNode implements INode {
    readonly contextValue: string = 'azureFunctionsNoSubscriptions';
    readonly label: string = "No subscriptions found. Edit filters...";
    readonly command: vscode.Command = {
        command: 'azure-account.selectSubscriptions',
        title: ''
    };
}

export class NoResourcesNode implements INode {
    readonly contextValue: string = 'azureFunctionsNoResources';
    readonly label: string = "No resources found.";
}

export class SignInToAzureNode implements INode {
    readonly contextValue: string = 'azureFunctionsSignInToAzure';
    readonly label: string = "Sign in to Azure...";
    readonly command: vscode.Command = {
        command: 'azure-account.login',
        title: ''
    };
}

export class ErrorNode implements INode {
    readonly contextValue: string = 'azureFunctionsError';
    readonly label: string;
    constructor(errorMessage: string) {
        this.label = `Error: ${errorMessage}`;
    }
}