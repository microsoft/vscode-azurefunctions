/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site, type StringDictionary, type WebSiteManagementClient } from "@azure/arm-appservice";
import { nonNullProp, parseError, type IActionContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";

import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { type AppSettingsClientProvider, type IAppSettingsClient } from "@microsoft/vscode-azext-azureappsettings";
import { type ContainerTreeItem } from "./ContainerTreeItem";

export class ContainerAppSettingsClientProvider implements AppSettingsClientProvider {
    private _node: ContainerTreeItem;
    private _subscription: ISubscriptionContext;
    constructor(node: ContainerTreeItem, subscription: ISubscriptionContext) {
        this._node = node;
        this._subscription = subscription;
    }
    public async createClient(context: IActionContext): Promise<IAppSettingsClient> {
        const client = await createWebSiteClient([context, this._subscription]);
        return new ContainerAppSettingsClient(this._node.site, client);
    }
}

export class ContainerAppSettingsClient implements IAppSettingsClient {
    public fullName: string;
    public isLinux: boolean;

    private _resourceGroup: string;
    private _siteName: string;
    private _client: WebSiteManagementClient;

    constructor(site: Site, client: WebSiteManagementClient) {
        this._client = client;
        this._resourceGroup = nonNullProp(site, 'resourceGroup');
        this.isLinux = true;
        this._siteName = nonNullProp(site, 'name');
    }

    public async listApplicationSettings(): Promise<StringDictionary> {
        return await this._client.webApps.listApplicationSettings(this._resourceGroup, this._siteName)
    }

    public async updateApplicationSettings(appSettings: StringDictionary): Promise<StringDictionary> {
        let response: StringDictionary;

        try {
            response = await this._client.webApps.updateApplicationSettings(this._resourceGroup, this._siteName, appSettings);
        } catch (error) {
            const errorType = parseError(error).errorType;
            // Ignoring this error since the sdk is returning a 202 error when the app settings are actually being updated successfully
            if (errorType !== '202') {
                throw error;
            }
        } finally {
            response = await this.listApplicationSettings();
        }

        return response;
    }
}
