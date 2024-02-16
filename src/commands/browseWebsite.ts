/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type SlotTreeItem } from '../tree/SlotTreeItem';
import { openUrl } from '../utils/openUrl';
import { pickAppResource } from '../utils/pickAppResource';

export async function browseWebsite(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await pickAppResource(context);
    }

    await openUrl(node.site.defaultHostUrl);
}
