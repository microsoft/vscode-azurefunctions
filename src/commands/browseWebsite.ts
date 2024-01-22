/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';
import { type SlotTreeItem } from '../tree/SlotTreeItem';
import { openUrl } from '../utils/openUrl';

export async function browseWebsite(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<SlotTreeItem>(context, {
            filter: functionFilter,
        });
    }

    try {
        await openUrl(node.site.defaultHostUrl);
    } catch {
        // containerized function apps don't have a default host url
        await openUrl(`https://${node.site.defaultHostName}`)
    }
}
