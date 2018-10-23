/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { isArray } from 'util';
import { ISiteTreeRoot } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeItem, createTreeItemsWithErrorHandling } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionTreeItem, getFunctionNameFromId } from './FunctionTreeItem';

export class FunctionsTreeItem extends AzureParentTreeItem<ISiteTreeRoot> {
    public static contextValue: string = 'azFuncFunctions';
    public readonly contextValue: string = FunctionsTreeItem.contextValue;
    public readonly label: string = localize('azFunc.Functions', 'Functions');
    public readonly childTypeLabel: string = localize('azFunc.Function', 'Function');

    private _nextLink: string | undefined;

    public get id(): string {
        return 'functions';
    }

    public get iconPath(): nodeUtils.IThemedIconPath {
        return nodeUtils.getThemedIconPath('BulletList');
    }

    public hasMoreChildrenImpl(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzureTreeItem<ISiteTreeRoot>[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const funcs: WebSiteManagementModels.FunctionEnvelopeCollection = this._nextLink ? await this.root.client.listFunctionsNext(this._nextLink) : await this.root.client.listFunctions();

        // https://github.com/Azure/azure-functions-host/issues/3502
        if (!isArray(funcs)) {
            throw new Error(localize('failedToList', 'Failed to list functions.'));
        }

        this._nextLink = funcs.nextLink;

        return await createTreeItemsWithErrorHandling(
            this,
            funcs,
            'azFuncInvalidFunction',
            async (fe: WebSiteManagementModels.FunctionEnvelope) => {
                const treeItem: FunctionTreeItem = new FunctionTreeItem(this, fe);
                if (treeItem.config.isHttpTrigger) {
                    // We want to cache the trigger url so that it is instantaneously copied when the user performs the copy action
                    // (Otherwise there might be a second or two delay which could lead to confusion)
                    await treeItem.initializeTriggerUrl();
                }
                return treeItem;
            },
            (fe: WebSiteManagementModels.FunctionEnvelope) => {
                return fe.id ? getFunctionNameFromId(fe.id) : undefined;
            }
        );
    }
}
