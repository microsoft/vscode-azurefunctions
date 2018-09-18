/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope, FunctionEnvelopeCollection } from 'azure-arm-website/lib/models';
import { SiteClient } from 'vscode-azureappservice';
import { IAzureNode, IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionTreeItem, getFunctionNameFromId } from './FunctionTreeItem';
import { InvalidTreeItem } from './InvalidTreeItem';

export class FunctionsTreeItem implements IAzureParentTreeItem {
    public static contextValue: string = 'azFuncFunctions';
    public readonly contextValue: string = FunctionsTreeItem.contextValue;
    public readonly label: string = localize('azFunc.Functions', 'Functions');
    public readonly childTypeLabel: string = localize('azFunc.Function', 'Function');

    private readonly _client: SiteClient;
    private _nextLink: string | undefined;

    public constructor(client: SiteClient) {
        this._client = client;
    }

    public get id(): string {
        return 'functions';
    }

    public get iconPath(): nodeUtils.IThemedIconPath {
        return nodeUtils.getThemedIconPath('BulletList');
    }

    public hasMoreChildren(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildren(_node: IAzureNode, clearCache: boolean): Promise<IAzureTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const funcs: FunctionEnvelopeCollection = this._nextLink ? await this._client.listFunctionsNext(this._nextLink) : await this._client.listFunctions();
        this._nextLink = funcs.nextLink;

        const treeItems: IAzureTreeItem[] = [];
        await Promise.all(funcs.map(async (fe: FunctionEnvelope) => {
            try {
                const treeItem: FunctionTreeItem = new FunctionTreeItem(this._client, fe);
                if (treeItem.config.isHttpTrigger) {
                    // We want to cache the trigger url so that it is instantaneously copied when the user performs the copy action
                    // (Otherwise there might be a second or two delay which could lead to confusion)
                    await treeItem.initializeTriggerUrl();
                }
                treeItems.push(treeItem);
            } catch (error) {
                if (fe.id) {
                    treeItems.push(new InvalidTreeItem(getFunctionNameFromId(fe.id), error, 'azFuncInvalidFunction'));
                }
            }
        }));

        return treeItems;
    }
}
