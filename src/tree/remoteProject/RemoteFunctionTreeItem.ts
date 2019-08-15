/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { ProgressLocation, window } from 'vscode';
import { IFunctionKeys, IHostKeys, ISiteTreeRoot, SiteClient } from 'vscode-azureappservice';
import { AzExtTreeItem, DialogResponses } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { HttpAuthLevel, ParsedFunctionJson } from '../../funcConfig/function';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { BindingsTreeItem } from '../BindingsTreeItem';
import { FunctionTreeItemBase } from '../FunctionTreeItemBase';
import { RemoteFunctionsTreeItem } from './RemoteFunctionsTreeItem';

export class RemoteFunctionTreeItem extends FunctionTreeItemBase {
    public readonly parent: RemoteFunctionsTreeItem;

    private _bindingsNode: BindingsTreeItem;

    private constructor(parent: RemoteFunctionsTreeItem, config: ParsedFunctionJson, name: string) {
        super(parent, config, name);
        this._bindingsNode = new BindingsTreeItem(this);
    }

    public static async create(parent: RemoteFunctionsTreeItem, func: WebSiteManagementModels.FunctionEnvelope): Promise<RemoteFunctionTreeItem> {
        const config: ParsedFunctionJson = new ParsedFunctionJson(func.config);
        const name: string = getFunctionNameFromId(nonNullProp(func, 'id'));
        const ti: RemoteFunctionTreeItem = new RemoteFunctionTreeItem(parent, config, name);
        // initialize
        await ti.refreshImpl();
        return ti;
    }

    public get root(): ISiteTreeRoot {
        return this.parent.parent.root;
    }

    public get client(): SiteClient {
        return this.root.client;
    }

    public get logStreamLabel(): string {
        return `${this.client.fullName}/${this.name}`;
    }

    public get logStreamPath(): string {
        return `application/functions/function/${encodeURIComponent(this.name)}`;
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        return [this._bindingsNode];
    }

    public async deleteTreeItemImpl(): Promise<void> {
        const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function "{0}"?', this.name);
        const deleting: string = localize('DeletingFunction', 'Deleting function "{0}"...', this.name);
        const deleteSucceeded: string = localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', this.name);
        await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.deleteResponse, DialogResponses.cancel);
        await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async (): Promise<void> => {
            ext.outputChannel.appendLine(deleting);
            await this.client.deleteFunction(this.name);
            window.showInformationMessage(deleteSucceeded);
            ext.outputChannel.appendLine(deleteSucceeded);
        });
    }

    public async getKey(): Promise<string | undefined> {
        switch (this.config.authLevel) {
            case HttpAuthLevel.admin:
                const hostKeys: IHostKeys = await this.client.listHostKeys();
                return nonNullProp(hostKeys, 'masterKey');
            case HttpAuthLevel.function:
                const functionKeys: IFunctionKeys = await this.client.listFunctionKeys(this.name);
                return nonNullProp(functionKeys, 'default');
            case HttpAuthLevel.anonymous:
            default:
                return undefined;
        }
    }
}

export function getFunctionNameFromId(id: string): string {
    const matches: RegExpMatchArray | null = id.match(/\/subscriptions\/(?:[^\/]+)\/resourceGroups\/(?:[^\/]+)\/providers\/Microsoft.Web\/sites\/(?:[^\/]+)\/functions\/([^\/]+)/);

    if (matches === null || matches.length < 2) {
        throw new Error(localize('invalidFuncId', 'Invalid Functions Id'));
    }

    return matches[1];
}
