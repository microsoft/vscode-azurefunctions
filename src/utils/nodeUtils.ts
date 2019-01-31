/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { AzureParentTreeItem, AzureTreeDataProvider, AzureTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';

export namespace nodeUtils {
    export interface IThemedIconPath {
        light: string;
        dark: string;
    }

    export function getIconPath(iconName: string): string {
        // (relative to dist folder)
        return path.join(__dirname, '..', 'resources', `${iconName}.svg`);
    }

    export function getThemedIconPath(iconName: string): IThemedIconPath {
        // (relative to dist folder)
        return {
            light: path.join(__dirname, '..', 'resources', 'light', `${iconName}.svg`),
            dark: path.join(__dirname, '..', 'resources', 'dark', `${iconName}.svg`)
        };
    }

    export async function getSubscriptionNode(tree: AzureTreeDataProvider, subscriptionId: string): Promise<AzureParentTreeItem> {
        const node: AzureParentTreeItem | undefined = <AzureParentTreeItem | undefined>(await tree.getChildren()).find((n: AzureTreeItem) => n.root.subscriptionId === subscriptionId);
        if (node) {
            return node;
        } else {
            throw new Error(localize('noMatchingSubscription', 'Failed to find a subscription matching id "{0}".', subscriptionId));
        }
    }
}
