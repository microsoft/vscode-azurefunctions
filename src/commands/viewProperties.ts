/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, openReadOnlyJson } from '@microsoft/vscode-azext-utils';
import { Uri, window } from 'vscode';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { LocalFunctionTreeItem } from '../tree/localProject/LocalFunctionTreeItem';
import { RemoteFunctionTreeItem } from '../tree/remoteProject/RemoteFunctionTreeItem';
import { ResolvedFunctionAppResource } from '../tree/ResolvedFunctionAppResource';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function viewProperties(context: IActionContext, node?: SlotTreeItem | RemoteFunctionTreeItem | LocalFunctionTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.tree.showTreeItemPicker<SlotTreeItem>(new RegExp(ResolvedFunctionAppResource.productionContextValue), context);
    }

    if (node instanceof LocalFunctionTreeItem) {
        if (!node.functionJsonPath) {
            throw new Error(localize('viewPropsNotSupported', 'View function properties is not supported for this project type.'));
        }
        await window.showTextDocument(Uri.file(node.functionJsonPath));
    } else {
        let data: {};
        if (node instanceof SlotTreeItem) {
            const siteNode: SlotTreeItem = node;
            await node.runWithTemporaryDescription(context, localize('retrievingProps', 'Retrieving properties...'), async () => {
                // `siteConfig` already exists on `node.site`, but has very limited properties for some reason. We want to get the full site config
                const client = await siteNode.site.createClient(context);
                siteNode.site.rawSite.siteConfig = await client.getSiteConfig();
            });
            data = node.site.rawSite;
        } else {
            data = node.rawConfig;
        }

        await openReadOnlyJson(node, data);
    }
}
