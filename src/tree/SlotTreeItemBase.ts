/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { MessageItem, window } from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, deleteSite, DeploymentsTreeItem, DeploymentTreeItem, ISiteTreeRoot, SiteClient } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeItem } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { IParsedHostJson, parseHostJson } from '../funcConfig/host';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { convertStringToRuntime } from '../vsCodeConfig/settings';
import { FunctionsTreeItem } from './FunctionsTreeItem';
import { FunctionTreeItem } from './FunctionTreeItem';
import { ProxiesTreeItem } from './ProxiesTreeItem';
import { ProxyTreeItem } from './ProxyTreeItem';

export abstract class SlotTreeItemBase extends AzureParentTreeItem<ISiteTreeRoot> {
    public logStreamPath: string = '';
    public readonly appSettingsTreeItem: AppSettingsTreeItem;
    public deploymentsNode: DeploymentsTreeItem | undefined;
    public hostJson: IParsedHostJson;
    public runtime: ProjectRuntime;
    public isConsumption: boolean;

    public abstract readonly contextValue: string;
    public abstract readonly label: string;

    private readonly _root: ISiteTreeRoot;
    private _state?: string;
    private _functionsTreeItem: FunctionsTreeItem | undefined;
    private _proxiesTreeItem: ProxiesTreeItem | undefined;

    public constructor(parent: AzureParentTreeItem, client: SiteClient) {
        super(parent);
        this._root = Object.assign({}, parent.root, { client });
        this._state = client.initialState;
        this.appSettingsTreeItem = new AppSettingsTreeItem(this, 'azureFunctions.toggleAppSettingVisibility');
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
        const descriptions: string[] = [];
        if (this.root.client.isLinux && this.isConsumption) {
            descriptions.push(localize('preview', 'Preview'));
        }

        if (this._state && this._state.toLowerCase() !== 'running') {
            descriptions.push(this._state);
        }

        return descriptions.join(' - ');
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(this.contextValue);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    /**
     * NOTE: We need to be extra careful in this method because it blocks many core scenarios (e.g. deploy) if the tree item is listed as invalid
     */
    public async refreshImpl(): Promise<void> {
        let runtime: ProjectRuntime | undefined;
        try {
            const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
            runtime = convertStringToRuntime(appSettings.properties && appSettings.properties.FUNCTIONS_EXTENSION_VERSION);
        } catch {
            // ignore and use default
        }
        // tslint:disable-next-line: strict-boolean-expressions
        this.runtime = runtime || ProjectRuntime.v2;

        // tslint:disable-next-line: no-any
        let data: any;
        try {
            data = await this.root.client.kudu.functionModel.getHostSettings();
        } catch {
            // ignore and use default
        }
        this.hostJson = parseHostJson(data, this.runtime);

        try {
            const asp: WebSiteManagementModels.AppServicePlan | undefined = await this.root.client.getAppServicePlan();
            this.isConsumption = !asp || !asp.sku || !asp.sku.tier || asp.sku.tier.toLowerCase() === 'dynamic';
        } catch {
            // ignore and use default
            this.isConsumption = true;
        }

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

        if (!this._functionsTreeItem) {
            this._functionsTreeItem = await FunctionsTreeItem.createFunctionsTreeItem(this);
        }

        if (!this._proxiesTreeItem) {
            this._proxiesTreeItem = await ProxiesTreeItem.createProxiesTreeItem(this);
        }

        return [this._functionsTreeItem, this.appSettingsTreeItem, this._proxiesTreeItem, this.deploymentsNode];
    }

    public pickTreeItemImpl(expectedContextValue: string | RegExp): AzureTreeItem<ISiteTreeRoot> | undefined {
        switch (expectedContextValue) {
            case FunctionsTreeItem.contextValue:
                return this._functionsTreeItem;
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
                } else if (expectedContextValue.source.includes(FunctionTreeItem.contextValueBase)) {
                    return this._functionsTreeItem;
                }
                return undefined;
        }
    }

    public async isReadOnly(): Promise<boolean> {
        const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
        return !!appSettings.properties && !!(appSettings.properties.WEBSITE_RUN_FROM_PACKAGE || appSettings.properties.WEBSITE_RUN_FROM_ZIP);
    }

    public async deleteTreeItemImpl(): Promise<void> {
        await deleteSite(this.root.client);
    }

    public showCreatedOutput(): void {
        const slot: string = localize('slot', 'slot');
        const functionApp: string = localize('functionApp', 'function app');
        const createdNewSlotTree: string = localize('createSlotTree', 'Created new {0} "{1}": {2}', this.root.client.isSlot ? slot : functionApp, this.root.client.fullName, `https://${this.root.client.defaultHostName}`);

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
