/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope, FunctionEnvelopeCollection } from 'azure-arm-website/lib/models';
import { isArray } from 'util';
import { SiteClient } from 'vscode-azureappservice';
import { createTreeItemsWithErrorHandling, IAzureNode, IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionTreeItem, getFunctionNameFromId } from './FunctionTreeItem';

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

        if (!isArray(funcs)) {
            throw new Error(localize('failedToList', 'Failed to list functions.'));
        }

        this._nextLink = funcs.nextLink;

        return await createTreeItemsWithErrorHandling(
            funcs,
            'azFuncInvalidFunction',
            async (fe: FunctionEnvelope) => {
                const treeItem: FunctionTreeItem = new FunctionTreeItem(this._client, fe);
                if (treeItem.config.isHttpTrigger) {
                    // We want to cache the trigger url so that it is instantaneously copied when the user performs the copy action
                    // (Otherwise there might be a second or two delay which could lead to confusion)
                    await treeItem.initializeTriggerUrl();
                }
                return treeItem;
            },
            (fe: FunctionEnvelope) => {
                return fe.id ? getFunctionNameFromId(fe.id) : undefined;
            }
        );
    }
}
