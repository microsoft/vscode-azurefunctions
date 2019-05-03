/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem, window } from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { SlotsTreeItem } from '../tree/SlotsTreeItem';
import { SlotTreeItem } from '../tree/SlotTreeItem';
import { deploy } from './deploy/deploy';

export async function createDeploymentSlot(actionContext: IActionContext, node?: SlotsTreeItem, resourceGroup?: string): Promise<string> {
    if (!node) {
        node = <SlotsTreeItem>await ext.tree.showTreeItemPicker(SlotsTreeItem.contextValue);
    }

    const slotNode: SlotTreeItem = <SlotTreeItem>(await node.createChild({ actionContext, resourceGroup }));
    const createdNewSlot: string = localize('createdNewSlot', 'Created new slot "{0}": {1}', slotNode.root.client.fullName, `https://${slotNode.root.client.defaultHostName}`);

    ext.outputChannel.appendLine(createdNewSlot);
    ext.outputChannel.appendLine('');
    const viewOutput: MessageItem = {
        title: localize('viewOutput', 'View Output')
    };
    const deployButton: MessageItem = {
        title: 'Deploy to Slot'
    };

    // Note: intentionally not waiting for the result of this before returning
    window.showInformationMessage(createdNewSlot, deployButton, viewOutput).then(async (result: MessageItem | undefined) => {
        if (result === viewOutput) {
            ext.outputChannel.show();
        } else if (result === deployButton) {
            await deploy(actionContext, slotNode);
        }
    });

    return slotNode.fullId;
}
