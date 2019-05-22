/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { isArray } from 'util';
import { ISiteTreeRoot } from 'vscode-azureappservice';
import { AzExtTreeItem, AzureParentTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { FunctionTreeItem, getFunctionNameFromId } from './FunctionTreeItem';
import { SlotTreeItemBase } from './SlotTreeItemBase';

export class FunctionsTreeItem extends AzureParentTreeItem<ISiteTreeRoot> {
    public static contextValue: string = 'azFuncFunctions';
    public readonly contextValue: string = FunctionsTreeItem.contextValue;
    public readonly label: string = localize('azFunc.Functions', 'Functions');
    public readonly childTypeLabel: string = localize('azFunc.Function', 'Function');
    public readonly parent: SlotTreeItemBase;

    private _nextLink: string | undefined;
    private _readOnly: boolean;

    private constructor(parent: SlotTreeItemBase) {
        super(parent);
    }

    public static async createFunctionsTreeItem(parent: SlotTreeItemBase): Promise<FunctionsTreeItem> {
        const ti: FunctionsTreeItem = new FunctionsTreeItem(parent);
        // initialize
        await ti.refreshImpl();
        return ti;
    }

    public get description(): string {
        return this._readOnly ? localize('readOnly', 'Read only') : '';
    }

    public get id(): string {
        return 'functions';
    }

    public get iconPath(): treeUtils.IThemedIconPath {
        return treeUtils.getThemedIconPath('BulletList');
    }

    public get readOnly(): boolean {
        return this._readOnly;
    }

    public async refreshImpl(): Promise<void> {
        this._readOnly = await this.parent.isReadOnly();
    }

    public hasMoreChildrenImpl(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const funcs: WebSiteManagementModels.FunctionEnvelopeCollection = this._nextLink ? await this.root.client.listFunctionsNext(this._nextLink) : await this.root.client.listFunctions();

        // https://github.com/Azure/azure-functions-host/issues/3502
        if (!isArray(funcs)) {
            throw new Error(localize('failedToList', 'Failed to list functions.'));
        }

        this._nextLink = funcs.nextLink;

        return await this.createTreeItemsWithErrorHandling(
            funcs,
            'azFuncInvalidFunction',
            async (fe: WebSiteManagementModels.FunctionEnvelope) => await FunctionTreeItem.createFunctionTreeItem(this, fe),
            (fe: WebSiteManagementModels.FunctionEnvelope) => {
                return fe.id ? getFunctionNameFromId(fe.id) : undefined;
            }
        );
    }
}
