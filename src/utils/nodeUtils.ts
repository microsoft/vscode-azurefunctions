/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { AzureParentTreeItem, AzureTreeDataProvider, AzureTreeItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';

export namespace nodeUtils {
    export interface IThemedIconPath {
        light: string;
        dark: string;
    }

    export function getIconPath(iconName: string): string {
        return path.join(getResourcesPath(), `${iconName}.svg`);
    }

    export function getThemedIconPath(iconName: string): IThemedIconPath {
        return {
            light: path.join(getResourcesPath(), 'light', `${iconName}.svg`),
            dark: path.join(getResourcesPath(), 'dark', `${iconName}.svg`)
        };
    }

    function getResourcesPath(): string {
        return ext.context.asAbsolutePath('resources');
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
