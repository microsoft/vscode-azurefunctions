/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Subscription } from 'azure-arm-resource/lib/subscription/models';
// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as path from 'path';
import { SiteWrapper } from 'vscode-azureappservice';
import { IAzureNode } from 'vscode-azureextensionui';
import KuduClient from 'vscode-azurekudu';
import { ArgumentError } from '../errors';

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
}
