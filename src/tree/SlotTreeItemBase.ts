/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { AppSettingsTreeItem, AppSettingTreeItem, deleteSite, DeploymentsTreeItem, DeploymentTreeItem, getFile, ISiteTreeRoot, LogFilesTreeItem, SiteClient, SiteFilesTreeItem } from 'vscode-azureappservice';
import { AzExtTreeItem, AzureParentTreeItem, IActionContext, TreeItemIconPath } from 'vscode-azureextensionui';
import { runFromPackageKey } from '../constants';
import { IParsedHostJson, parseHostJson } from '../funcConfig/host';
import { FuncVersion, latestGAVersion, tryParseFuncVersion } from '../FuncVersion';
import { envUtils } from '../utils/envUtils';
import { nonNullValue } from '../utils/nonNull';
import { treeUtils } from '../utils/treeUtils';
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
    public site: WebSiteManagementModels.Site;

    public abstract readonly contextValue: string;
    public abstract readonly label: string;

    private readonly _root: ISiteTreeRoot;
    private _functionsTreeItem: RemoteFunctionsTreeItem | undefined;
    private _proxiesTreeItem: ProxiesTreeItem | undefined;
    private readonly _logFilesTreeItem: LogFilesTreeItem;
    private readonly _siteFilesTreeItem: SiteFilesTreeItem;
    private _cachedVersion: FuncVersion | undefined;
    private _cachedHostJson: IParsedHostJson | undefined;
    private _cachedIsConsumption: boolean | undefined;

    public constructor(parent: AzureParentTreeItem, client: SiteClient, site: WebSiteManagementModels.Site) {
        super(parent);
        this.site = site;
        this._root = Object.assign({}, parent.root, { client });
        this.appSettingsTreeItem = new AppSettingsTreeItem(this, client);
        this._siteFilesTreeItem = new SiteFilesTreeItem(this, client, true);
        this._logFilesTreeItem = new LogFilesTreeItem(this, client);

        const valuesToMask = [
            client.siteName, client.slotName, client.defaultHostName, client.resourceGroup,
            client.planName, client.planResourceGroup, client.kuduHostName, client.gitUrl,
            site.repositorySiteName, ...(site.hostNames || []), ...(site.enabledHostNames || [])
        ];
        for (const v of valuesToMask) {
            if (v) {
                this.valuesToMask.push(v);
            }
        }
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

    public async getHostUrl(): Promise<string> {
        return this.root.client.defaultHostUrl;
    }

    public get description(): string | undefined {
        return this._state?.toLowerCase() !== 'running' ? this._state : undefined;
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath(this.contextValue);
    }

    private get _state(): string | undefined {
        return this.site.state;
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    /**
     * NOTE: We need to be extra careful in this method because it blocks many core scenarios (e.g. deploy) if the tree item is listed as invalid
     */
    public async refreshImpl(): Promise<void> {
        this._cachedVersion = undefined;
        this._cachedHostJson = undefined;
        this._cachedIsConsumption = undefined;

        this.site = nonNullValue(await this.root.client.getSite(), 'site');
    }

    public async getVersion(): Promise<FuncVersion> {
        let result: FuncVersion | undefined = this._cachedVersion;
        if (result === undefined) {
            let version: FuncVersion | undefined;
            try {
                const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
                version = tryParseFuncVersion(appSettings.properties && appSettings.properties.FUNCTIONS_EXTENSION_VERSION);
            } catch {
                // ignore and use default
            }
            result = version || latestGAVersion;
            this._cachedVersion = result;
        }

        return result;
    }

    public async getHostJson(context: IActionContext): Promise<IParsedHostJson> {
        let result: IParsedHostJson | undefined = this._cachedHostJson;
        if (!result) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let data: any;
            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                data = JSON.parse((await getFile(context, this.client, 'site/wwwroot/host.json')).data);
            } catch {
                // ignore and use default
            }
            const version: FuncVersion = await this.getVersion();
            result = parseHostJson(data, version);
            this._cachedHostJson = result;
        }

        return result;
    }

    public async getApplicationSettings(): Promise<ApplicationSettings> {
        const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
        return appSettings.properties || {};
    }

    public async setApplicationSetting(_context: IActionContext, key: string, value: string): Promise<void> {
        const settings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
        if (!settings.properties) {
            settings.properties = {};
        }
        settings.properties[key] = value;
        await this.root.client.updateApplicationSettings(settings);
    }

    public async getIsConsumption(): Promise<boolean> {
        let result: boolean | undefined = this._cachedIsConsumption;
        if (result === undefined) {
            try {
                result = await this.root.client.getIsConsumption();
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
        this.deploymentsNode = new DeploymentsTreeItem(this, this.root.client, siteConfig, sourceControl);

        if (!this._functionsTreeItem) {
            this._functionsTreeItem = await RemoteFunctionsTreeItem.createFunctionsTreeItem(this);
        }

        if (!this._proxiesTreeItem) {
            this._proxiesTreeItem = await ProxiesTreeItem.createProxiesTreeItem(this);
        }

        return [this._functionsTreeItem, this.appSettingsTreeItem, this._siteFilesTreeItem, this._logFilesTreeItem, this.deploymentsNode, this._proxiesTreeItem];
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
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
                    } else if (matchesAnyPart(expectedContextValue, ProjectResource.Functions, ProjectResource.Function)) {
                        return this._functionsTreeItem;
                    }
            }
        }

        return undefined;
    }

    public compareChildrenImpl(): number {
        return 0; // already sorted
    }

    public async isReadOnly(): Promise<boolean> {
        const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
        return [runFromPackageKey, 'WEBSITE_RUN_FROM_ZIP'].some(key => appSettings.properties && envUtils.isEnvironmentVariableSet(appSettings.properties[key]));
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        await deleteSite(context, this.root.client);
    }
}
