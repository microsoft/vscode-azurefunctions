/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URL } from 'url';
import { OutputChannel } from 'vscode';
import * as vscode from 'vscode';
import { getKuduClient, ILogStream, SiteClient } from 'vscode-azureappservice';
import { DialogResponses, IAzureNode } from 'vscode-azureextensionui';
import KuduClient from 'vscode-azurekudu';
import { FunctionEnvelope, FunctionSecrets, MasterKey } from 'vscode-azurekudu/lib/models';
import { ILogStreamTreeItem } from '../commands/logstream/ILogStreamTreeItem';
import { ArgumentError } from '../errors';
import { FunctionConfig, HttpAuthLevel } from '../FunctionConfig';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';

export class FunctionTreeItem implements ILogStreamTreeItem {
    public static contextValue: string = 'azFuncFunction';
    public readonly contextValue: string = FunctionTreeItem.contextValue;
    public readonly config: FunctionConfig;
    public readonly client: SiteClient;
    public logStream: ILogStream | undefined;
    public logStreamOutputChannel: vscode.OutputChannel | undefined;

    private readonly _name: string;
    private readonly _outputChannel: OutputChannel;
    private _triggerUrl: string;

    public constructor(client: SiteClient, func: FunctionEnvelope, outputChannel: OutputChannel) {
        if (!func.name) {
            throw new ArgumentError(func);
        }

        this.client = client;
        this._name = func.name;
        this._outputChannel = outputChannel;

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
        return `${this.client.fullName}/${this._name}`;
    }

    public get logStreamPath(): string {
        return `application/functions/function/${encodeURIComponent(this._name)}`;
    }

    public async deleteTreeItem(node: IAzureNode): Promise<void> {
        const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function "{0}"?', this._name);
        await node.ui.showWarningMessage(message, DialogResponses.deleteResponse, DialogResponses.cancel);
        this._outputChannel.show(true);
        this._outputChannel.appendLine(localize('DeletingFunction', 'Deleting function "{0}"...', this._name));
        const kuduClient: KuduClient = await getKuduClient(this.client);
        await kuduClient.functionModel.deleteMethod(this._name);
        this._outputChannel.appendLine(localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', this._name));
    }

    public async initializeTriggerUrl(): Promise<void> {
        const kuduClient: KuduClient = await getKuduClient(this.client);
        const functionSecrets: FunctionSecrets = await kuduClient.functionModel.getSecrets(this._name);
        if (functionSecrets.triggerUrl === undefined) {
            throw new ArgumentError(functionSecrets);
        }

        const triggerUrl: URL = new URL(functionSecrets.triggerUrl);
        switch (this.config.authLevel) {
            case HttpAuthLevel.admin:
                const keyResult: MasterKey = await kuduClient.functionModel.getMasterKey();
                if (keyResult.masterKey === undefined) {
                    throw new ArgumentError(keyResult);
                }
                // tslint:disable-next-line:no-backbone-get-set-outside-model
                triggerUrl.searchParams.set('code', keyResult.masterKey);
                break;
            case HttpAuthLevel.anonymous:
                triggerUrl.search = '';
                break;
            case HttpAuthLevel.function:
            default:
                // Nothing to do here (the original trigger url already has a 'function' level key attached)
                break;
        }

        this._triggerUrl = triggerUrl.toString();
    }
}
