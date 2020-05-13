/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { MessageItem, window } from 'vscode';
import { AppSettingsTreeItem, DeploymentsTreeItem, ISiteTreeRoot, LogFilesTreeItem, SiteClient, SiteFilesTreeItem } from 'vscode-azureappservice';
import { AzExtTreeItem, AzureParentTreeItem, IContextValue } from 'vscode-azureextensionui';
import { KuduClient } from 'vscode-azurekudu';
import { ext } from '../extensionVariables';
import { IParsedHostJson, parseHostJson } from '../funcConfig/host';
import { FuncVersion, latestGAVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { ApplicationSettings, IProjectTreeItem } from './IProjectTreeItem';
import { ProxiesTreeItem } from './ProxiesTreeItem';
import { RemoteFunctionsTreeItem } from './remoteProject/RemoteFunctionsTreeItem';

export abstract class SlotTreeItemBase extends AzureParentTreeItem<ISiteTreeRoot> implements IProjectTreeItem {
    public logStreamPath: string = '';
    public readonly appSettingsTreeItem: AppSettingsTreeItem;
    public deploymentsNode: DeploymentsTreeItem | undefined;
    public readonly site: WebSiteManagementModels.Site;

    public abstract readonly contextValue: IContextValue;
    public abstract readonly label: string;
    public autoSelectInTreeItemPicker: boolean = true;

    private readonly _root: ISiteTreeRoot;
    private _state?: string;
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
        this._state = client.initialState;
        this.appSettingsTreeItem = new AppSettingsTreeItem(this);
        this._siteFilesTreeItem = new SiteFilesTreeItem(this, true);
        this._logFilesTreeItem = new LogFilesTreeItem(this);
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
        return this._state && this._state.toLowerCase() !== 'running' ? this._state : undefined;
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

        try {
            this._state = await this.root.client.getState();
        } catch {
            this._state = 'Unknown';
        }
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
            // tslint:disable-next-line: strict-boolean-expressions
            result = version || latestGAVersion;
            this._cachedVersion = result;
        }

        return result;
    }

    public async getHostJson(): Promise<IParsedHostJson> {
        let result: IParsedHostJson | undefined = this._cachedHostJson;
        if (!result) {
            // tslint:disable-next-line: no-any
            let data: any;
            try {
                const kuduClient: KuduClient = await this.root.client.getKuduClient();
                data = await kuduClient.functionModel.getHostSettings();
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
        // tslint:disable-next-line: strict-boolean-expressions
        return appSettings.properties || {};
    }

    public async setApplicationSetting(key: string, value: string): Promise<void> {
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
        this.deploymentsNode = new DeploymentsTreeItem(this, siteConfig, sourceControl);

        if (!this._functionsTreeItem) {
            this._functionsTreeItem = await RemoteFunctionsTreeItem.createFunctionsTreeItem(this);
        }

        if (!this._proxiesTreeItem) {
            this._proxiesTreeItem = await ProxiesTreeItem.createProxiesTreeItem(this);
        }

        return [this._functionsTreeItem, this.appSettingsTreeItem, this._siteFilesTreeItem, this._logFilesTreeItem, this.deploymentsNode, this._proxiesTreeItem];
    }

    public compareChildrenImpl(): number {
        return 0; // already sorted
    }

    public async isReadOnly(): Promise<boolean> {
        const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
        return !!appSettings.properties && !!(appSettings.properties.WEBSITE_RUN_FROM_PACKAGE || appSettings.properties.WEBSITE_RUN_FROM_ZIP);
    }

    public showCreatedOutput(): void {
        const slot: string = localize('createdNewSlot', 'Created new slot "{0}": {1}', this.root.client.fullName, `https://${this.root.client.defaultHostName}`);
        const functionApp: string = localize('createdNewApp', 'Created new function app "{0}": {1}', this.root.client.fullName, `https://${this.root.client.defaultHostName}`);
        const createdNewSlotTree: string = this.root.client.isSlot ? slot : functionApp;

        ext.outputChannel.appendLog(createdNewSlotTree);
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
