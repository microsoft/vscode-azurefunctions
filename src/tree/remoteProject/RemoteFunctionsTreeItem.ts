/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { isArray } from 'util';
import { AzExtTreeItem } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { FunctionsTreeItemBase } from '../FunctionsTreeItemBase';
import { SlotTreeItemBase } from '../SlotTreeItemBase';
import { getFunctionNameFromId, RemoteFunctionTreeItem } from './RemoteFunctionTreeItem';

export class RemoteFunctionsTreeItem extends FunctionsTreeItemBase {
    public readonly parent: SlotTreeItemBase;
    public isReadOnly: boolean;

    private _nextLink: string | undefined;

    private constructor(parent: SlotTreeItemBase) {
        super(parent);
    }

    public static async createFunctionsTreeItem(parent: SlotTreeItemBase): Promise<RemoteFunctionsTreeItem> {
        const ti: RemoteFunctionsTreeItem = new RemoteFunctionsTreeItem(parent);
        // initialize
        await ti.refreshImpl();
        return ti;
    }

    public async refreshImpl(): Promise<void> {
        this.isReadOnly = await this.parent.isReadOnly();
    }

    public hasMoreChildrenImpl(): boolean {
        return !!this._nextLink;
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const funcs: WebSiteManagementModels.FunctionEnvelopeCollection = this._nextLink ?
            await this.parent.client.listFunctionsNext(this._nextLink) :
            await this.parent.client.listFunctions();

        // https://github.com/Azure/azure-functions-host/issues/3502
        if (!isArray(funcs)) {
            throw new Error(localize('failedToList', 'Failed to list functions.'));
        }

        this._nextLink = funcs.nextLink;

        return await this.createTreeItemsWithErrorHandling(
            funcs,
            'azFuncInvalidFunction',
            async (fe: WebSiteManagementModels.FunctionEnvelope) => await RemoteFunctionTreeItem.create(this, fe),
            (fe: WebSiteManagementModels.FunctionEnvelope) => {
                return fe.id ? getFunctionNameFromId(fe.id) : undefined;
            }
        );
    }
}
