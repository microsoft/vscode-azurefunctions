/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { AzureFunctionsExplorer } from '../AzureFunctionsExplorer';
import { FunctionAppNode } from '../nodes/FunctionAppNode';
import * as util from '../util';

export async function stopFunctionApp(explorer: AzureFunctionsExplorer, node?: FunctionAppNode): Promise<void> {
    if (!node) {
        node = <FunctionAppNode>(await explorer.showNodePicker(FunctionAppNode.contextValue));
    }

    const client: WebSiteManagementClient = node.getWebSiteClient();
    await client.webApps.stop(node.resourceGroup, node.name);
    await util.waitForFunctionAppState(client, node.resourceGroup, node.name, util.FunctionAppState.Stopped);
    explorer.refresh(node.parent);
}
