/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { Site } from 'azure-arm-website/lib/models';
import * as path from 'path';
import { OutputChannel } from 'vscode';
import { SiteWrapper } from 'vscode-azureappservice';
import { IAzureNode, IAzureTreeItem } from 'vscode-azureextensionui';
import { ArgumentError } from '../errors';
import { nodeUtils } from '../utils/nodeUtils';

export class FunctionAppTreeItem implements IAzureTreeItem {
    public static readonly contextValue: string = 'azureFunctionsFunctionApp';
    public readonly contextValue: string = FunctionAppTreeItem.contextValue;
    public readonly id: string;
    public readonly siteWrapper: SiteWrapper;

    private readonly _state: string | undefined;
    private readonly _outputChannel: OutputChannel;

    public constructor(site: Site, outputChannel: OutputChannel) {
        this.siteWrapper = new SiteWrapper(site);
        if (!site.id || !site.state) {
            throw new ArgumentError(site);
        }
        this._state = site.state;
        this.id = site.id;
        this._outputChannel = outputChannel;
    }

    public get label(): string {
        return this._state === 'Running' ? this.siteWrapper.name : `${this.siteWrapper.name} (${this._state})`;
    }

    get iconPath(): string {
        return path.join(__filename, '..', '..', '..', '..', 'resources', `${FunctionAppTreeItem.contextValue}.svg`);
    }

    public async deleteTreeItem(node: IAzureNode): Promise<void> {
        const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
        await this.siteWrapper.deleteSite(client, this._outputChannel);
    }
}
