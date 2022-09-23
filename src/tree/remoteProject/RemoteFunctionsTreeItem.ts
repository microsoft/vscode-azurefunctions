/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope } from '@azure/arm-appservice';
import { AzExtTreeItem, IActionContext } from '@microsoft/vscode-azext-utils';
import * as retry from 'p-retry';
import { localize } from '../../localize';
import { FunctionsTreeItemBase } from '../FunctionsTreeItemBase';
import { SlotTreeItem } from '../SlotTreeItem';
import { getFunctionNameFromId, RemoteFunctionTreeItem } from './RemoteFunctionTreeItem';

export class RemoteFunctionsTreeItem extends FunctionsTreeItemBase {
    public readonly parent: SlotTreeItem;
    public isReadOnly: boolean;

    private _nextLink: string | undefined;

    private constructor(parent: SlotTreeItem) {
        super(parent);
    }

    public static async createFunctionsTreeItem(context: IActionContext, parent: SlotTreeItem): Promise<RemoteFunctionsTreeItem> {
        const ti: RemoteFunctionsTreeItem = new RemoteFunctionsTreeItem(parent);
        // initialize
        await ti.refreshImpl(context);
        return ti;
    }

    public async refreshImpl(context: IActionContext): Promise<void> {
        this.isReadOnly = await this.parent.isReadOnly(context);
    }

    public hasMoreChildrenImpl(): boolean {
        return !!this._nextLink;
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        /*
            Related to issue: https://github.com/microsoft/vscode-azurefunctions/issues/3179
            Sometimes receive a 'BadGateway' error on initial fetch, but consecutive re-fetching usually fixes the issue.
            Under these circumstances, we will attempt to do the call 3 times during warmup before throwing the error.
        */
        const retries = 3;
        const client = await this.parent.site.createClient(context);

        const funcs = await retry<FunctionEnvelope[]>(
            async (attempt: number) => {
                // Load more currently broken https://github.com/Azure/azure-sdk-for-js/issues/20380
                const response = await client.listFunctions();

                // https://github.com/Azure/azure-functions-host/issues/3502
                if (!Array.isArray(response)) {
                    throw new Error(localize('failedToList', 'Failed to list functions.'));
                }

                // Retry listing functions if all we see is a "WarmUp" function, an internal function that goes away once the app is ...warmed up
                if (!(response.length === 1 && isWarmupFunction(response[0]))) {
                    context.telemetry.measurements.listFunctionsAttempt = attempt;
                } else {
                    throw new Error(localize('warmUpFunction', 'Server response was a WarmUp function.'));
                }

                return response;
            },
            { retries, minTimeout: 10 * 1000 }
        );

        return await this.createTreeItemsWithErrorHandling(
            funcs,
            'azFuncInvalidFunction',
            async (fe: FunctionEnvelope) => await RemoteFunctionTreeItem.create(context, this, fe),
            (fe: FunctionEnvelope) => {
                return fe.id ? getFunctionNameFromId(fe.id) : undefined;
            }
        );
    }
}

function isWarmupFunction(func: FunctionEnvelope): boolean {
    try {
        return !!func.id && getFunctionNameFromId(func.id).toLowerCase() === 'warmup';
    } catch {
        return false;
    }
}
