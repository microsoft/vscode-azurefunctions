/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import { FunctionAppNode } from '../nodes/FunctionAppNode';
import { getWebSiteClient } from '../nodes/SubscriptionNode';

export async function stopFunctionApp(explorer: AzureFunctionsExplorer, node?: FunctionAppNode): Promise<void> {
    if (!node) {
        node = <FunctionAppNode>(await explorer.showNodePicker(FunctionAppNode.contextValue));
    }

    const client: WebSiteManagementClient = getWebSiteClient(node);
    await node.siteWrapper.stop(client);
    explorer.refresh(node.parent);
}
