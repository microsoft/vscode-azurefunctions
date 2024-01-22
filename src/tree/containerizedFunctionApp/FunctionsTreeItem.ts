/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type FunctionEnvelope, type Site } from "@azure/arm-appservice";
import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { uiUtils } from "@microsoft/vscode-azext-azureutils";
import { nonNullProp, nonNullValueAndProp, type AzExtTreeItem, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as retry from 'p-retry';
import { ParsedFunctionJson } from "../../funcConfig/function";
import { localize } from "../../localize";
import { FunctionsTreeItemBase } from "../FunctionsTreeItemBase";
import { getFunctionNameFromId } from "../remoteProject/RemoteFunctionTreeItem";
import { type ContainerTreeItem } from "./ContainerTreeItem";
import { FunctionItem } from "./FunctionItem";
import { FunctionTreeItem } from "./FunctionTreeItem";

export class FunctionsTreeItem extends FunctionsTreeItemBase {
    public isReadOnly: boolean;
    private _nextLink: string | undefined;

    constructor(public readonly parent: ContainerTreeItem, public readonly site: Site) {
        super(parent);
        this.isReadOnly = true;
    }

    public static async createFunctionsTreeItem(context: IActionContext, parent: ContainerTreeItem): Promise<FunctionsTreeItem> {
        const ti: FunctionsTreeItem = new FunctionsTreeItem(parent, parent.site);
        // initialize
        await ti.refreshImpl(context);
        return ti;
    }

    public hasMoreChildrenImpl(): boolean {
        return !!this._nextLink;
    }

    public async refreshImpl(context: IActionContext): Promise<void> {
        this.isReadOnly = await this.parent.isReadOnly(context);
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
        const client = await createWebSiteClient([context, this.parent.subscription]);
        const funcs = await retry<FunctionEnvelope[]>(
            async (attempt: number) => {
                // Load more currently broken https://github.com/Azure/azure-sdk-for-js/issues/20380
                const response = (await uiUtils.listAllIterator(client.webApps.listFunctions(nonNullValueAndProp(this.site, 'resourceGroup'), nonNullValueAndProp(this.site, 'name'))));
                const failedToList = localize('failedToList', 'Failed to list functions.');

                // https://github.com/Azure/azure-functions-host/issues/3502
                if (!Array.isArray(response)) {
                    throw new Error(failedToList);
                }

                // Retry listing functions if all we see is a "WarmUp" function, an internal function that goes away once the app is ...warmed up
                if (!(response.length === 1 && isWarmupFunction(response[0]))) {
                    context.telemetry.measurements.listFunctionsAttempt = attempt;
                } else {
                    throw new Error(failedToList);
                }

                return response;
            },
            { retries, minTimeout: 10 * 1000 }
        );

        return await this.createTreeItemsWithErrorHandling(
            funcs,
            'azFuncInvalidFunction',
            async (fe: FunctionEnvelope) => await FunctionTreeItem.create(
                context,
                this,
                new FunctionItem(
                    this.parent,
                    getFunctionNameFromId(nonNullProp(fe, 'id')),
                    new ParsedFunctionJson(fe.config),
                    this,
                    this.parent.site
                )
            ),
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

