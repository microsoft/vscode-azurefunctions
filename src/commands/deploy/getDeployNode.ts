/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureTreeItem, IActionContext, IExpectedContextValue } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';

export interface IDeployNode {
    node: SlotTreeItemBase;
    isNewFunctionApp: boolean;
}

export async function getDeployNode(context: IActionContext, target: vscode.Uri | string | SlotTreeItemBase | undefined, functionAppId: string | {} | undefined, expectedContextValue: IExpectedContextValue): Promise<IDeployNode> {
    let node: SlotTreeItemBase | undefined;
    let isNewFunctionApp: boolean = false;

    if (target instanceof SlotTreeItemBase) {
        node = target;
    } else if (functionAppId && typeof functionAppId === 'string') {
        node = await ext.tree.findTreeItem(functionAppId, context);
        if (!node) {
            throw new Error(localize('noMatchingFunctionApp', 'Failed to find a Function App matching id "{0}".', functionAppId));
        }
    } else {
        const newNodes: SlotTreeItemBase[] = [];
        const disposable: vscode.Disposable = ext.tree.onTreeItemCreate((newNode: SlotTreeItemBase) => { newNodes.push(newNode); });
        try {
            node = await ext.tree.showTreeItemWizard<SlotTreeItemBase>(expectedContextValue, context);
        } finally {
            disposable.dispose();
        }

        isNewFunctionApp = newNodes.some((newNode: AzureTreeItem) => node && newNode.fullId === node.fullId);
    }

    context.telemetry.properties.isNewFunctionApp = String(isNewFunctionApp);
    return { node, isNewFunctionApp };
}
