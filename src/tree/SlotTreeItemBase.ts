/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { AppSettingsTreeItem, AppSettingTreeItem, deleteSite, DeploymentsTreeItem, DeploymentTreeItem, ISiteTreeRoot, SiteClient } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionsTreeItem } from './FunctionsTreeItem';
import { FunctionTreeItem } from './FunctionTreeItem';
import { ProxiesTreeItem } from './ProxiesTreeItem';
import { ProxyTreeItem } from './ProxyTreeItem';

export abstract class SlotTreeItemBase extends AzureParentTreeItem<ISiteTreeRoot> {
    public logStreamPath: string = '';
    public readonly appSettingsTreeItem: AppSettingsTreeItem;
    public deploymentsNode: DeploymentsTreeItem | undefined;

    public abstract readonly contextValue: string;
    public abstract readonly label: string;

    private readonly _root: ISiteTreeRoot;
    private _state?: string;
    private readonly _functionsTreeItem: FunctionsTreeItem;
    private readonly _proxiesTreeItem: ProxiesTreeItem;

    public constructor(parent: AzureParentTreeItem, client: SiteClient) {
        super(parent);
        this._root = Object.assign({}, parent.root, { client });
        this._state = client.initialState;
        this._functionsTreeItem = new FunctionsTreeItem(this);
        this.appSettingsTreeItem = new AppSettingsTreeItem(this, 'azureFunctions.toggleAppSettingVisibility');
        this._proxiesTreeItem = new ProxiesTreeItem(this);
    }

    // overrides ISubscriptionRoot with an object that also has SiteClient
    public get root(): ISiteTreeRoot {
        return this._root;
    }

    public get logStreamLabel(): string {
        return this.root.client.fullName;
    }

    public get id(): string {
        return this.root.client.id;
    }

    public get description(): string | undefined {
        const stateDescription: string | undefined = this._state && this._state.toLowerCase() !== 'running' ? this._state : undefined;
        const previewDescription: string | undefined = this.root.client.isLinux ? localize('linuxPreview', 'Linux Preview') : undefined;
        if (stateDescription && previewDescription) {
            return `${previewDescription} - ${stateDescription}`;
        } else {
            return stateDescription || previewDescription;
        }
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(this.contextValue);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async refreshImpl(): Promise<void> {
        try {
            this._state = await this.root.client.getState();
        } catch {
            this._state = 'Unknown';
        }
    }

    public async loadMoreChildrenImpl(): Promise<AzureTreeItem<ISiteTreeRoot>[]> {
        const siteConfig: WebSiteManagementModels.SiteConfig = await this.root.client.getSiteConfig();
        const sourceControl: WebSiteManagementModels.SiteSourceControl = await this.root.client.getSourceControl();
        this.deploymentsNode = new DeploymentsTreeItem(this, siteConfig, sourceControl, 'azureFunctions.connectToGitHub');
        return [this._functionsTreeItem, this.appSettingsTreeItem, this._proxiesTreeItem, this.deploymentsNode];
    }

    public pickTreeItemImpl(expectedContextValue: string | RegExp): AzureTreeItem<ISiteTreeRoot> | undefined {
        switch (expectedContextValue) {
            case FunctionsTreeItem.contextValue:
            case FunctionTreeItem.contextValue:
                return this._functionsTreeItem;
            case AppSettingsTreeItem.contextValue:
            case AppSettingTreeItem.contextValue:
                return this.appSettingsTreeItem;
            case ProxiesTreeItem.contextValue:
            case ProxyTreeItem.contextValue:
                return this._proxiesTreeItem;
            case DeploymentsTreeItem.contextValueConnected:
            case DeploymentsTreeItem.contextValueUnconnected:
            case DeploymentTreeItem.contextValue:
                return this.deploymentsNode;
            default:
                // DeploymentTreeItem.contextValue is a RegExp, but the passed in contextValue can be a string so check for a match
                if (typeof expectedContextValue === 'string' && DeploymentTreeItem.contextValue.test(expectedContextValue)) { return this.deploymentsNode; }
                return undefined;
        }
    }

    public async deleteTreeItemImpl(): Promise<void> {
        await deleteSite(this.root.client);
    }
}
