/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { AzureTreeDataProvider, IAzureNode, IAzureParentNode } from 'vscode-azureextensionui';
import { localize } from '../localize';

export namespace nodeUtils {
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
}
