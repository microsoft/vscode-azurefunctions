/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site, type StringDictionary } from "@azure/arm-appservice";
import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { AppSettingsTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { nonNullProp, nonNullValueAndProp, type AzExtTreeItem, type IActionContext, type ISubscriptionContext, type TreeItemIconPath } from "@microsoft/vscode-azext-utils";
import { type ResolvedAppResourceBase } from "@microsoft/vscode-azext-utils/hostapi";
import { type ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import { latestGAVersion, tryParseFuncVersion, type FuncVersion } from "../../FuncVersion";
import { runFromPackageKey } from "../../constants";
import { ext } from "../../extensionVariables";
import { parseHostJson, type IParsedHostJson } from "../../funcConfig/host";
import { envUtils } from "../../utils/envUtils";
import { treeUtils } from "../../utils/treeUtils";
import { type ApplicationSettings, type FuncHostRequest } from "../IProjectTreeItem";
import { ContainerAppSettingsClientProvider } from "./AppSettingsClient";
import { type ContainerTreeItem } from "./ContainerTreeItem";
import { FunctionsTreeItem } from "./FunctionsTreeItem";
import { ImageTreeItem } from "./ImageTreeItem";

export class ResolvedContainerizedFunctionAppResource implements ResolvedAppResourceBase {
    public site: Site;
    public maskedValuesToAdd: string[] = [];

    public appSettingsTreeItem: AppSettingsTreeItem;
    private _functionsTreeItem: FunctionsTreeItem;
    private _imageTreeItem: ImageTreeItem;

    private _cachedVersion: FuncVersion | undefined;
    private _cachedHostJson: IParsedHostJson | undefined;

    public constructor(site: Site) {
        this.site = site;
    }

    public static async createResolvedFunctionAppResource(context: IActionContext, subscription: ISubscriptionContext, site: Site): Promise<ResolvedContainerizedFunctionAppResource> {
        const resource = new ResolvedContainerizedFunctionAppResource(site);
        const client = await createWebSiteClient([context, subscription]);
        resource.site.siteConfig = await client.webApps.getConfiguration(nonNullProp(resource.site, 'resourceGroup'), nonNullProp(resource.site, 'name'));
        return resource;
    }

    public get name(): string {
        return this.label;
    }

    public get label(): string {
        return nonNullProp(this.site, 'name');
    }

    public get id(): string {
        return nonNullProp(this.site, 'id');
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath('azFuncProductionSlot');
    }

    public get viewProperties(): ViewPropertiesModel {
        return {
            data: this.site,
            label: this.name,
        }
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        const proxyTree: ContainerTreeItem = this as unknown as ContainerTreeItem;

        this._functionsTreeItem = new FunctionsTreeItem(proxyTree, this.site);
        this._imageTreeItem = new ImageTreeItem(proxyTree, this.site, this.maskedValuesToAdd);
        this.appSettingsTreeItem = new AppSettingsTreeItem(proxyTree, new ContainerAppSettingsClientProvider(proxyTree, proxyTree.subscription), ext.prefix, {
            contextValuesToAdd: ['azFunc']
        });

        const children: AzExtTreeItem[] = [this._functionsTreeItem, this._imageTreeItem, this.appSettingsTreeItem]

        return children;
    }

    public async isReadOnly(context: IActionContext): Promise<boolean> {
        const proxyTree: ContainerTreeItem = this as unknown as ContainerTreeItem;
        const client = await (new ContainerAppSettingsClientProvider(proxyTree, proxyTree.subscription).createClient(context));
        const appSettings: StringDictionary = await client.listApplicationSettings();

        return [runFromPackageKey, 'WEBSITE_RUN_FROM_ZIP'].some(key => appSettings.properties && envUtils.isEnvironmentVariableSet(appSettings.properties[key]));
    }

    public async getHostRequest(): Promise<FuncHostRequest> {
        return { url: `https://${nonNullValueAndProp(this.site, 'defaultHostName')}` }
    }

    public async getHostJson(context: IActionContext): Promise<IParsedHostJson> {
        let result: IParsedHostJson | undefined = this._cachedHostJson;
        if (!result) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let data: any;
            const version: FuncVersion = await this.getVersion(context);
            result = parseHostJson(data, version);
            this._cachedHostJson = result;
        }
        return result;
    }

    public async getVersion(context: IActionContext): Promise<FuncVersion> {
        let result: FuncVersion | undefined = this._cachedVersion;
        if (result === undefined) {
            let version: FuncVersion | undefined;
            try {
                const proxyTree: ContainerTreeItem = this as unknown as ContainerTreeItem;
                const client = await (new ContainerAppSettingsClientProvider(proxyTree, proxyTree.subscription).createClient(context));
                const appSettings: StringDictionary = await client.listApplicationSettings();
                version = tryParseFuncVersion(appSettings.properties && appSettings.properties.FUNCTIONS_EXTENSION_VERSION);
            } catch {
                // ignore and use default
            }
            result = version || latestGAVersion;
            this._cachedVersion = result;
        }
        return result
    }

    public async getApplicationSettings(context: IActionContext): Promise<ApplicationSettings> {
        const proxyTree: ContainerTreeItem = this as unknown as ContainerTreeItem;
        const client = await (new ContainerAppSettingsClientProvider(proxyTree, proxyTree.subscription).createClient(context));
        const appSettings: StringDictionary = await client.listApplicationSettings();
        return appSettings.properties || {};
    }

    public async setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void> {
        const proxyTree: ContainerTreeItem = this as unknown as ContainerTreeItem;
        const client = await (new ContainerAppSettingsClientProvider(proxyTree, proxyTree.subscription).createClient(context));
        const appSettings: StringDictionary = await client.listApplicationSettings();
        if (!appSettings.properties) {
            appSettings.properties = {};
        }
        appSettings.properties[key] = value;
        await client.updateApplicationSettings(appSettings);
    }
}

