/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Subscription } from 'azure-arm-resource/lib/subscription/models';
// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as path from 'path';
import * as vscode from 'vscode';
import { SiteWrapper } from 'vscode-azureappservice';
import { AzureTreeDataProvider, IAzureNode, IAzureParentNode } from 'vscode-azureextensionui';
import KuduClient from 'vscode-azurekudu';
import { ArgumentError } from '../errors';
import { localize } from '../localize';
import { cpUtils } from './cpUtils';

export namespace nodeUtils {
    export function getWebSiteClient(node: IAzureNode): WebSiteManagementClient {
        const subscription: Subscription = node.subscription;
        if (subscription.subscriptionId) {
            return new WebSiteManagementClient(node.credentials, subscription.subscriptionId);
        } else {
            throw new ArgumentError(subscription);
        }
    }

    export async function getKuduClient(node: IAzureNode, siteWrapper: SiteWrapper): Promise<KuduClient> {
        const client: WebSiteManagementClient = getWebSiteClient(node);
        return await siteWrapper.getKuduClient(client);
    }

    export interface IThemedIconPath {
        light: string;
        dark: string;
    }

    export function getIconPath(iconName: string): string {
        return path.join(__filename, '..', '..', '..', '..', 'resources', `${iconName}.svg`);
    }

    export function getThemedIconPath(iconName: string): IThemedIconPath {
        return {
            light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', `${iconName}.svg`),
            dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', `${iconName}.svg`)
        };
    }

    export async function getSubscriptionNode(tree: AzureTreeDataProvider, subscriptionId: string): Promise<IAzureParentNode> {
        const node: IAzureParentNode | undefined = <IAzureParentNode | undefined>(await tree.getChildren()).find((n: IAzureNode) => n.subscription.subscriptionId === subscriptionId);
        if (node) {
            return node;
        } else {
            throw new Error(localize('noMatchingSubscription', 'Failed to find a subscription matching id "{0}".', subscriptionId));
        }
    }
    export async function validateNpmInstalled(outputChannel?: vscode.OutputChannel): Promise<void> {
        try {
            await cpUtils.executeCommand(outputChannel, undefined, 'npm', '-v');
        } catch (error) {
            throw new Error(localize('azFunc.npmNotFound', 'Failed to find "npm" on path.'));
        }
    }
}
