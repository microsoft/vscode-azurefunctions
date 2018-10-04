/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope } from 'azure-arm-website/lib/models';
import { URL } from 'url';
import { ProgressLocation, window } from 'vscode';
import { functionsAdminRequest, ISiteTreeRoot } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeItem, DialogResponses } from 'vscode-azureextensionui';
import { ArgumentError } from '../errors';
import { ext } from '../extensionVariables';
import { FunctionConfig, HttpAuthLevel } from '../FunctionConfig';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';

export class FunctionTreeItem extends AzureTreeItem<ISiteTreeRoot> {
    public static contextValue: string = 'azFuncFunction';
    public readonly contextValue: string = FunctionTreeItem.contextValue;
    public readonly config: FunctionConfig;

    private readonly _name: string;
    private _triggerUrl: string;

    public constructor(parent: AzureParentTreeItem, func: FunctionEnvelope) {
        super(parent);
        if (!func.id) {
            throw new ArgumentError(func);
        }

        this._name = getFunctionNameFromId(func.id);

        this.config = new FunctionConfig(func.config);
    }

    public get id(): string {
        return this._name;
    }

    public get label(): string {
        return this.config.disabled ? localize('azFunc.DisabledFunction', '{0} (Disabled)', this._name) : this._name;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(FunctionTreeItem.contextValue);
    }

    public get triggerUrl(): string {
        return this._triggerUrl;
    }

    public get logStreamLabel(): string {
        return `${this.root.client.fullName}/${this._name}`;
    }

    public get logStreamPath(): string {
        return `application/functions/function/${encodeURIComponent(this._name)}`;
    }

    public async deleteTreeItemImpl(): Promise<void> {
        const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function "{0}"?', this._name);
        const deleting: string = localize('DeletingFunction', 'Deleting function "{0}"...', this._name);
        const deleteSucceeded: string = localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', this._name);
        await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.deleteResponse, DialogResponses.cancel);
<<<<<<< HEAD
        await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async (): Promise<void> => {
            ext.outputChannel.appendLine(deleting);
            await this.client.deleteFunction(this._name);
            window.showInformationMessage(deleteSucceeded);
            ext.outputChannel.appendLine(deleteSucceeded);
        });
=======
        ext.outputChannel.show(true);
        ext.outputChannel.appendLine(localize('DeletingFunction', 'Deleting function "{0}"...', this._name));
        await this.root.client.deleteFunction(this._name);
        ext.outputChannel.appendLine(localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', this._name));
>>>>>>> 90ede2d3526dfab8452ec97937470fe2c6bdf00c
    }

    public async initializeTriggerUrl(): Promise<void> {
        const triggerUrl: URL = new URL(`${this.root.client.defaultHostUrl}/api/${this._name}`);
        const key: string | undefined = await this.getKey();
        if (key) {
            triggerUrl.searchParams.set('code', key);
        }

        this._triggerUrl = triggerUrl.toString();
    }

    public async getKey(): Promise<string | undefined> {
        let urlPath: string;
        switch (this.config.authLevel) {
            case HttpAuthLevel.admin:
                urlPath = '/host/systemkeys/_master';
                break;
            case HttpAuthLevel.function:
                urlPath = `functions/${this._name}/keys/default`;
                break;
            case HttpAuthLevel.anonymous:
            default:
                return undefined;
        }

        const data: string = await functionsAdminRequest(this.root.client, urlPath);
        try {
            // tslint:disable-next-line:no-unsafe-any
            const result: string = JSON.parse(data).value;
            if (result) {
                return result;
            }
        } catch {
            // ignore json parse error and throw better error below
        }

        throw new Error(localize('keyFail', 'Failed to get key for trigger "{0}".', this._name));
    }
}

export function getFunctionNameFromId(id: string): string {
    const matches: RegExpMatchArray | null = id.match(/\/subscriptions\/(?:[^\/]+)\/resourceGroups\/(?:[^\/]+)\/providers\/Microsoft.Web\/sites\/(?:[^\/]+)\/functions\/([^\/]+)/);

    if (matches === null || matches.length < 2) {
        throw new Error(localize('invalidFuncId', 'Invalid Functions Id'));
    }

    return matches[1];
}
