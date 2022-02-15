/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope } from '@azure/arm-appservice';
import { AzExtTreeItem, IActionContext } from '@microsoft/vscode-azext-utils';
import { isArray } from 'util';
import { localize } from '../../localize';
import { delay } from '../../utils/delay';
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

    public static async createFunctionsTreeItem(context: IActionContext, parent: SlotTreeItemBase): Promise<RemoteFunctionsTreeItem> {
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

        const client = await this.parent.site.createClient(context);
        let funcs: FunctionEnvelope[];
        const maxTime = Date.now() + 2 * 60 * 1000;
        let attempt = 1;
        while (true) {
            // Load more currently broken https://github.com/Azure/azure-sdk-for-js/issues/20380
            funcs = await client.listFunctions();

            // https://github.com/Azure/azure-functions-host/issues/3502
            if (!isArray(funcs)) {
                throw new Error(localize('failedToList', 'Failed to list functions.'));
            }

            // Retry listing functions if all we see is a "WarmUp" function, an internal function that goes away once the app is ...warmed up
            if (Date.now() > maxTime || !(funcs.length === 1 && isWarmupFunction(funcs[0]))) {
                context.telemetry.measurements.listFunctionsAttempt = attempt;
                break;
            } else {
                attempt += 1;
                await delay(10 * 1000);
            }
        }

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
