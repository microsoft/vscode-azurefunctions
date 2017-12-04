/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';
import { SiteWrapper } from 'vscode-azureappservice';
import { IAzureNode, IAzureTreeItem, UserCancelledError } from 'vscode-azureextensionui';
import KuduClient from 'vscode-azurekudu';
import { FunctionEnvelope } from 'vscode-azurekudu/lib/models';
import { DialogResponses } from '../DialogResponses';
import { ArgumentError } from '../errors';
import { localize } from '../localize';
import { ITemplateFunction } from '../templates/Template';
import { nodeUtils } from '../utils/nodeUtils';

export class FunctionTreeItem implements IAzureTreeItem {
    public static contextValue: string = 'azFuncFunction';
    public readonly contextValue: string = FunctionTreeItem.contextValue;

    private readonly _siteWrapper: SiteWrapper;
    private readonly _name: string;
    private readonly _disabled: boolean = false;
    private readonly _parentId: string;
    private readonly _outputChannel: OutputChannel;

    public constructor(siteWrapper: SiteWrapper, func: FunctionEnvelope, parentId: string, outputChannel: OutputChannel) {
        if (!func.name) {
            throw new ArgumentError(func);
        }

        this._siteWrapper = siteWrapper;
        this._name = func.name;
        this._disabled = (<ITemplateFunction>func.config).disabled;
        this._parentId = parentId;
        this._outputChannel = outputChannel;
    }

    public get id(): string {
        return `${this._parentId}/${this._name}`;
    }

    public get label(): string {
        return this._disabled ? localize('azFunc.DisabledFunction', '{0} (Disabled)', this._name) : this._name;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(FunctionTreeItem.contextValue);
    }

    public async deleteTreeItem(node: IAzureNode<FunctionTreeItem>): Promise<void> {
        const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function "{0}"?', this._name);
        if (await vscode.window.showWarningMessage(message, DialogResponses.yes, DialogResponses.cancel) === DialogResponses.yes) {
            this._outputChannel.show(true);
            this._outputChannel.appendLine(localize('DeletingFunction', 'Deleting function "{0}"...', this._name));
            const client: KuduClient = await nodeUtils.getKuduClient(node, this._siteWrapper);
            await client.functionModel.deleteMethod(this._name);
            this._outputChannel.appendLine(localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', this._name));
        } else {
            throw new UserCancelledError();
        }
    }
}
