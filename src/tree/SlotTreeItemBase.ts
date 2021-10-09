/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { AppSettingsTreeItem, AppSettingTreeItem, deleteSite, DeploymentsTreeItem, DeploymentTreeItem, getFile, LogFilesTreeItem, ParsedSite, SiteFilesTreeItem } from 'vscode-azureappservice';
import { AzExtParentTreeItem, AzExtTreeItem, IActionContext, TreeItemIconPath } from 'vscode-azureextensionui';
import { runFromPackageKey } from '../constants';
import { IParsedHostJson, parseHostJson } from '../funcConfig/host';
import { FuncVersion, latestGAVersion, tryParseFuncVersion } from '../FuncVersion';
import { envUtils } from '../utils/envUtils';
import { nonNullValue } from '../utils/nonNull';
import { treeUtils } from '../utils/treeUtils';
import { ApplicationSettings, FuncHostRequest, IProjectTreeItem } from './IProjectTreeItem';
import { matchesAnyPart, ProjectResource, ProjectSource } from './projectContextValues';
import { RemoteFunctionsTreeItem } from './remoteProject/RemoteFunctionsTreeItem';

export abstract class SlotTreeItemBase extends AzExtParentTreeItem implements IProjectTreeItem {
    public logStreamPath: string = '';
    public readonly appSettingsTreeItem: AppSettingsTreeItem;
    public deploymentsNode: DeploymentsTreeItem | undefined;
    public readonly source: ProjectSource = ProjectSource.Remote;
    public site: ParsedSite;

    public abstract readonly contextValue: string;
    public abstract readonly label: string;

    private _functionsTreeItem: RemoteFunctionsTreeItem | undefined;
    private readonly _logFilesTreeItem: LogFilesTreeItem;
    private readonly _siteFilesTreeItem: SiteFilesTreeItem;
    private _cachedVersion: FuncVersion | undefined;
    private _cachedHostJson: IParsedHostJson | undefined;
    private _cachedIsConsumption: boolean | undefined;

    public constructor(parent: AzExtParentTreeItem, site: ParsedSite) {
        super(parent);
        this.site = site;
        this.appSettingsTreeItem = new AppSettingsTreeItem(this, site);
        this._siteFilesTreeItem = new SiteFilesTreeItem(this, site, true);
        this._logFilesTreeItem = new LogFilesTreeItem(this, site);

        const valuesToMask = [
            site.siteName, site.slotName, site.defaultHostName, site.resourceGroup,
            site.planName, site.planResourceGroup, site.kuduHostName, site.gitUrl,
            site.rawSite.repositorySiteName, ...(site.rawSite.hostNames || []), ...(site.rawSite.enabledHostNames || [])
        ];
        for (const v of valuesToMask) {
            if (v) {
                this.valuesToMask.push(v);
            }
        }
    }

    public get logStreamLabel(): string {
        return this.site.fullName;
    }

    public get id(): string {
        return this.site.id;
    }

    public async getHostRequest(): Promise<FuncHostRequest> {
        return { url: this.site.defaultHostUrl };
    }

    public get description(): string | undefined {
        return this._state?.toLowerCase() !== 'running' ? this._state : undefined;
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath(this.contextValue);
    }

    private get _state(): string | undefined {
        return this.site.rawSite.state;
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    /**
     * NOTE: We need to be extra careful in this method because it blocks many core scenarios (e.g. deploy) if the tree item is listed as invalid
     */
    public async refreshImpl(context: IActionContext): Promise<void> {
        this._cachedVersion = undefined;
        this._cachedHostJson = undefined;
        this._cachedIsConsumption = undefined;

        const client = await this.site.createClient(context);
        this.site = new ParsedSite(nonNullValue(await client.getSite(), 'site'), this.subscription);
    }

    public async getVersion(context: IActionContext): Promise<FuncVersion> {
        let result: FuncVersion | undefined = this._cachedVersion;
        if (result === undefined) {
            let version: FuncVersion | undefined;
            try {
                const client = await this.site.createClient(context);
                const appSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();
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
                data = JSON.parse((await getFile(context, this.site, 'site/wwwroot/host.json')).data);
            } catch {
                // ignore and use default
            }
            const version: FuncVersion = await this.getVersion(context);
            result = parseHostJson(data, version);
            this._cachedHostJson = result;
        }

        return result;
    }

    public async getApplicationSettings(context: IActionContext): Promise<ApplicationSettings> {
        const client = await this.site.createClient(context);
        const appSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();
        return appSettings.properties || {};
    }

    public async setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void> {
        const client = await this.site.createClient(context);
        const settings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();
        if (!settings.properties) {
            settings.properties = {};
        }
        settings.properties[key] = value;
        await client.updateApplicationSettings(settings);
    }

    public async getIsConsumption(context: IActionContext): Promise<boolean> {
        let result: boolean | undefined = this._cachedIsConsumption;
        if (result === undefined) {
            try {
                const client = await this.site.createClient(context);
                result = await client.getIsConsumption(context);
            } catch {
                // ignore and use default
                result = true;
            }
            this._cachedIsConsumption = result;
        }

        return result;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        const client = await this.site.createClient(context);
        const siteConfig: WebSiteManagementModels.SiteConfig = await client.getSiteConfig();
        const sourceControl: WebSiteManagementModels.SiteSourceControl = await client.getSourceControl();
        this.deploymentsNode = new DeploymentsTreeItem(this, this.site, siteConfig, sourceControl);

        if (!this._functionsTreeItem) {
            this._functionsTreeItem = await RemoteFunctionsTreeItem.createFunctionsTreeItem(context, this);
        }


        return [this._functionsTreeItem, this.appSettingsTreeItem, this._siteFilesTreeItem, this._logFilesTreeItem, this.deploymentsNode];
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        for (const expectedContextValue of expectedContextValues) {
            switch (expectedContextValue) {
                case AppSettingsTreeItem.contextValue:
                case AppSettingTreeItem.contextValue:
                    return this.appSettingsTreeItem;
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

    public async isReadOnly(context: IActionContext): Promise<boolean> {
        const client = await this.site.createClient(context);
        const appSettings: WebSiteManagementModels.StringDictionary = await client.listApplicationSettings();
        return [runFromPackageKey, 'WEBSITE_RUN_FROM_ZIP'].some(key => appSettings.properties && envUtils.isEnvironmentVariableSet(appSettings.properties[key]));
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        await deleteSite(context, this.site);
    }
}
