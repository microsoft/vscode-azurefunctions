/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site, type StringDictionary } from "@azure/arm-appservice";
import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { AppSettingTreeItem, AppSettingsTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { DialogResponses, nonNullProp, nonNullValueAndProp, type AzExtTreeItem, type IActionContext, type ISubscriptionContext, type TreeItemIconPath } from "@microsoft/vscode-azext-utils";
import { type ResolvedAppResourceBase } from "@microsoft/vscode-azext-utils/hostapi";
import { ProgressLocation, window } from "vscode";
import { latestGAVersion, tryParseFuncVersion, type FuncVersion } from "../../FuncVersion";
import { ext } from "../../extensionVariables";
import { parseHostJson, type IParsedHostJson } from "../../funcConfig/host";
import { localize } from "../../localize";
import { treeUtils } from "../../utils/treeUtils";
import { type ApplicationSettings } from "../IProjectTreeItem";
import { ResolvedFunctionAppBase } from "../ResolvedFunctionAppBase";
import { matchContextValue } from "../ResolvedFunctionAppResource";
import { ProjectResource, ProjectSource, matchesAnyPart } from "../projectContextValues";
import { ContainerAppSettingsClientProvider } from "./AppSettingsClient";
import { ContainerFunctionsTreeItem } from "./ContainerFunctionsTreeItem";
import { type ContainerTreeItem } from "./ContainerTreeItem";
import { ImageTreeItem } from "./ImageTreeItem";

export type ContainerSite = Site & { defaultHostUrl?: string; fullName?: string; isSlot?: boolean };

export class ResolvedContainerizedFunctionAppResource extends ResolvedFunctionAppBase implements ResolvedAppResourceBase {
    public site: ContainerSite;
    public maskedValuesToAdd: string[] = [];
    public contextValuesToAdd?: string[] | undefined;
    public static containerContextValue: string = 'azFuncContainer';

    public appSettingsTreeItem: AppSettingsTreeItem;
    private _functionsTreeItem: ContainerFunctionsTreeItem;
    private _imageTreeItem: ImageTreeItem;
    private _containerTreeItem: ContainerTreeItem;

    private _cachedVersion: FuncVersion | undefined;
    private _cachedHostJson: IParsedHostJson | undefined;

    public readonly source: ProjectSource = ProjectSource.Remote;

    public constructor(site: Site) {
        super(Object.assign(site, { defaultHostUrl: `https://${site.defaultHostName}`, fullName: site.name, isSlot: false }));
        this.contextValuesToAdd = ['azFuncProductionSlot', 'container'];

        const valuesToMask = [
            this.site.name, this.site.defaultHostName, this.site.resourceGroup,
            this.site.repositorySiteName, ...(this.site.hostNames || []), ...(this.site.enabledHostNames || [])
        ];

        for (const v of valuesToMask) {
            if (v) {
                this.maskedValuesToAdd.push(v);
            }
        }
    }

    public static async createResolvedFunctionAppResource(context: IActionContext, subscription: ISubscriptionContext, site: Site): Promise<ResolvedContainerizedFunctionAppResource> {
        const resource = new ResolvedContainerizedFunctionAppResource(site);
        const client = await createWebSiteClient([context, subscription]);
        resource.site.siteConfig = await client.webApps.getConfiguration(nonNullProp(resource.site, 'resourceGroup'), nonNullProp(resource.site, 'name'));
        return resource;
    }

    public get label(): string {
        return nonNullProp(this.site, 'name');
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath('azFuncProductionSlot');
    }

    public async isReadOnly(): Promise<boolean> {
        return true
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

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        const proxyTree: ContainerTreeItem = this as unknown as ContainerTreeItem;

        this._functionsTreeItem = new ContainerFunctionsTreeItem(proxyTree, this.site);
        this._imageTreeItem = new ImageTreeItem(proxyTree, this.site, this.maskedValuesToAdd);
        this.appSettingsTreeItem = new AppSettingsTreeItem(proxyTree, new ContainerAppSettingsClientProvider(proxyTree, proxyTree.subscription), ext.prefix, {
            contextValuesToAdd: ['azFunc', 'container'],
        });

        const children: AzExtTreeItem[] = [this._functionsTreeItem, this._imageTreeItem, this.appSettingsTreeItem]

        return children;
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function app "{0}"?', this.site.name);
        const proxyTree: ContainerTreeItem = this as unknown as ContainerTreeItem;
        const deleting: string = localize('DeletingFunctionApp', 'Deleting function app "{0}"...', this.site.name);
        const deleteSucceeded: string = localize('DeleteFunctionAppSucceeded', 'Successfully deleted function app "{0}".', this.site.name);
        await context.ui.showWarningMessage(message, { modal: true, stepName: 'confirmDelete' }, DialogResponses.deleteResponse);
        await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async (): Promise<void> => {
            ext.outputChannel.appendLog(deleting);
            const client = await createWebSiteClient([context, proxyTree.subscription]);
            await client.webApps.delete(nonNullValueAndProp(this.site, 'resourceGroup'), nonNullValueAndProp(this.site, 'name'));
            void window.showInformationMessage(deleteSucceeded);
            ext.outputChannel.appendLog(deleteSucceeded);
        });
    }

    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        for (const expectedContextValue of expectedContextValues) {
            const appSettingsContextValues = [AppSettingsTreeItem.contextValue, AppSettingTreeItem.contextValue];
            if (matchContextValue(expectedContextValue, appSettingsContextValues)) {
                return this.appSettingsTreeItem;
            }

            if (matchContextValue(expectedContextValue, [ResolvedContainerizedFunctionAppResource.containerContextValue])) {
                return this._containerTreeItem;
            }

            if (matchesAnyPart(expectedContextValue, ProjectResource.Functions, ProjectResource.Function)) {
                return this._functionsTreeItem;
            }
        }

        return undefined
    }
}
