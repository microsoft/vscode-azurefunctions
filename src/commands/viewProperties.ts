/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { openReadOnlyJson, type IActionContext } from '@microsoft/vscode-azext-utils';
import { Uri, window } from 'vscode';
import { localize } from '../localize';
import { type SlotTreeItem } from '../tree/SlotTreeItem';
import { ContainerFunctionTreeItem } from '../tree/containerizedFunctionApp/ContainerFunctionTreeItem';
import { LocalFunctionTreeItem } from '../tree/localProject/LocalFunctionTreeItem';

export async function viewProperties(context: IActionContext, node: SlotTreeItem | LocalFunctionTreeItem | ContainerFunctionTreeItem): Promise<void> {
    if (node instanceof LocalFunctionTreeItem) {
        if (!node.functionJsonPath) {
            throw new Error(localize('viewPropsNotSupported', 'View function properties is not supported for this project type.'));
        }
        await window.showTextDocument(Uri.file(node.functionJsonPath));
    } else if (node instanceof ContainerFunctionTreeItem) {
        await openReadOnlyJson(node, node.rawConfig);
    } else {
        const site: ParsedSite = await node.getSite(context);
        await node.runWithTemporaryDescription(context, localize('retrievingProps', 'Retrieving properties...'), async () => {
            // `siteConfig` already exists on `node.site`, but has very limited properties for some reason. We want to get the full site config
            const client = await site.createClient(context);
            site.rawSite.siteConfig = await client.getSiteConfig();
        });
        await openReadOnlyJson(node, site.rawSite);
    }
}
