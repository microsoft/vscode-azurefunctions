/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { MessageItem, window } from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, deleteSite, DeploymentsTreeItem, DeploymentTreeItem, ISiteTreeRoot, SiteClient } from 'vscode-azureappservice';
import { AzExtTreeItem, AzureParentTreeItem } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { IParsedHostJson, parseHostJson } from '../funcConfig/host';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { convertStringToRuntime } from '../vsCodeConfig/settings';
import { ApplicationSettings, IProjectTreeItem } from './IProjectTreeItem';
import { matchesAnyPart, ProjectResource, ProjectSource } from './projectContextValues';
import { ProxiesTreeItem } from './ProxiesTreeItem';
import { ProxyTreeItem } from './ProxyTreeItem';
import { RemoteFunctionsTreeItem } from './remoteProject/RemoteFunctionsTreeItem';

export abstract class SlotTreeItemBase extends AzureParentTreeItem<ISiteTreeRoot> implements IProjectTreeItem {
    public logStreamPath: string = '';
    public readonly appSettingsTreeItem: AppSettingsTreeItem;
    public deploymentsNode: DeploymentsTreeItem | undefined;
    public readonly source: ProjectSource = ProjectSource.Remote;
    public readonly site: WebSiteManagementModels.Site;

    public abstract readonly contextValue: string;
    public abstract readonly label: string;

    private readonly _root: ISiteTreeRoot;
    private _state?: string;
    private _functionsTreeItem: RemoteFunctionsTreeItem | undefined;
    private _proxiesTreeItem: ProxiesTreeItem | undefined;
    private _cachedRuntime: ProjectRuntime | undefined;
    private _cachedHostJson: IParsedHostJson | undefined;
    private _cachedIsConsumption: boolean | undefined;

    public constructor(parent: AzureParentTreeItem, client: SiteClient, site: WebSiteManagementModels.Site) {
        super(parent);
        this.site = site;
        this._root = Object.assign({}, parent.root, { client });
        this._state = client.initialState;
        this.appSettingsTreeItem = new AppSettingsTreeItem(this, 'azureFunctions.toggleAppSettingVisibility');
    }

    // overrides ISubscriptionContext with an object that also has SiteClient
    public get root(): ISiteTreeRoot {
        return this._root;
    }

    public get client(): SiteClient {
        return this.root.client;
    }

    public get logStreamLabel(): string {
        return this.root.client.fullName;
    }

    public get id(): string {
        return this.root.client.id;
    }

    public get hostUrl(): string {
        return this.root.client.defaultHostUrl;
    }

    public get description(): string | undefined {
        const descriptions: string[] = [];

        // getting `isConsumption` is an async operation that's not worth delaying the loading of all function apps just for this description
        // thus if the cached value is `undefined`, we will assume it's consumption (the default and most common case)
        const isConsumption: boolean = this._cachedIsConsumption === undefined ? true : this._cachedIsConsumption;
        if (this.root.client.isLinux && isConsumption) {
            descriptions.push(localize('preview', 'Preview'));
        }

        if (this._state && this._state.toLowerCase() !== 'running') {
            descriptions.push(this._state);
        }

        return descriptions.join(' - ');
    }

    public get iconPath(): string {
        return treeUtils.getIconPath(this.contextValue);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    /**
     * NOTE: We need to be extra careful in this method because it blocks many core scenarios (e.g. deploy) if the tree item is listed as invalid
     */
    public async refreshImpl(): Promise<void> {
        this._cachedRuntime = undefined;
        this._cachedHostJson = undefined;
        this._cachedIsConsumption = undefined;

        try {
            this._state = await this.root.client.getState();
        } catch {
            this._state = 'Unknown';
        }
    }

    public async getRuntime(): Promise<ProjectRuntime> {
        let result: ProjectRuntime | undefined = this._cachedRuntime;
        if (result === undefined) {
            let runtime: ProjectRuntime | undefined;
            try {
                const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
                runtime = convertStringToRuntime(appSettings.properties && appSettings.properties.FUNCTIONS_EXTENSION_VERSION);
            } catch {
                // ignore and use default
            }
            // tslint:disable-next-line: strict-boolean-expressions
            result = runtime || ProjectRuntime.v2;
            this._cachedRuntime = result;
        }

        return result;
    }

    public async getHostJson(): Promise<IParsedHostJson> {
        let result: IParsedHostJson | undefined = this._cachedHostJson;
        if (!result) {
            // tslint:disable-next-line: no-any
            let data: any;
            try {
                data = await this.root.client.kudu.functionModel.getHostSettings();
            } catch {
                // ignore and use default
            }
            const runtime: ProjectRuntime = await this.getRuntime();
            result = parseHostJson(data, runtime);
            this._cachedHostJson = result;
        }

        return result;
    }

    public async getApplicationSettings(): Promise<ApplicationSettings> {
        const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
        // tslint:disable-next-line: strict-boolean-expressions
        return appSettings.properties || {};
    }

    public async getIsConsumption(): Promise<boolean> {
        let result: boolean | undefined = this._cachedIsConsumption;
        if (result === undefined) {
            try {
                const asp: WebSiteManagementModels.AppServicePlan | undefined = await this.root.client.getAppServicePlan();
                result = !asp || !asp.sku || !asp.sku.tier || asp.sku.tier.toLowerCase() === 'dynamic';
            } catch {
                // ignore and use default
                result = true;
            }
            this._cachedIsConsumption = result;
        }

        return result;
    }

    public async loadMoreChildrenImpl(): Promise<AzExtTreeItem[]> {
        const siteConfig: WebSiteManagementModels.SiteConfig = await this.root.client.getSiteConfig();
        const sourceControl: WebSiteManagementModels.SiteSourceControl = await this.root.client.getSourceControl();
        this.deploymentsNode = new DeploymentsTreeItem(this, siteConfig, sourceControl, 'azureFunctions.connectToGitHub');

        if (!this._functionsTreeItem) {
            this._functionsTreeItem = await RemoteFunctionsTreeItem.createFunctionsTreeItem(this);
        }

        if (!this._proxiesTreeItem) {
            this._proxiesTreeItem = await ProxiesTreeItem.createProxiesTreeItem(this);
        }

        return [this._functionsTreeItem, this.appSettingsTreeItem, this._proxiesTreeItem, this.deploymentsNode];
    }

    public pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): AzExtTreeItem | undefined {
        for (const expectedContextValue of expectedContextValues) {
            switch (expectedContextValue) {
                case AppSettingsTreeItem.contextValue:
                case AppSettingTreeItem.contextValue:
                    return this.appSettingsTreeItem;
                case ProxiesTreeItem.contextValue:
                case ProxyTreeItem.contextValue:
                case ProxyTreeItem.readOnlyContextValue:
                    return this._proxiesTreeItem;
                case DeploymentsTreeItem.contextValueConnected:
                case DeploymentsTreeItem.contextValueUnconnected:
                case DeploymentTreeItem.contextValue:
                    return this.deploymentsNode;
                default:
                    if (typeof expectedContextValue === 'string') {
                        // DeploymentTreeItem.contextValue is a RegExp, but the passed in contextValue can be a string so check for a match
                        if (DeploymentTreeItem.contextValue.test(expectedContextValue)) {
                            return this.deploymentsNode;
                        }
                    } else if (matchesAnyPart(expectedContextValue, ProjectResource.Functions, ProjectResource.Function, ProjectResource.Bindings, ProjectResource.Binding)) {
                        return this._functionsTreeItem;
                    }
            }
        }

        return undefined;
    }

    public async isReadOnly(): Promise<boolean> {
        const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
        return !!appSettings.properties && !!(appSettings.properties.WEBSITE_RUN_FROM_PACKAGE || appSettings.properties.WEBSITE_RUN_FROM_ZIP);
    }

    public async deleteTreeItemImpl(): Promise<void> {
        await deleteSite(this.root.client);
    }

    public showCreatedOutput(): void {
        const slot: string = localize('createdNewSlot', 'Created new slot "{0}": {1}', this.root.client.fullName, `https://${this.root.client.defaultHostName}`);
        const functionApp: string = localize('createdNewApp', 'Created new function app "{0}": {1}', this.root.client.fullName, `https://${this.root.client.defaultHostName}`);
        const createdNewSlotTree: string = this.root.client.isSlot ? slot : functionApp;

        ext.outputChannel.appendLine(createdNewSlotTree);
        ext.outputChannel.appendLine('');
        const viewOutput: MessageItem = {
            title: localize('viewOutput', 'View Output')
        };

        // Note: intentionally not waiting for the result of this before returning
        window.showInformationMessage(createdNewSlotTree, viewOutput).then(async (result: MessageItem | undefined) => {
            if (result === viewOutput) {
                ext.outputChannel.show();
            }
        });
    }
}
