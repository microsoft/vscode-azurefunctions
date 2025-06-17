/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type SiteConfig, type SiteSourceControl, type StringDictionary } from "@azure/arm-appservice";
import { DeleteLastServicePlanStep, DeleteSiteStep, DeploymentTreeItem, DeploymentsTreeItem, LogFilesTreeItem, ParsedSite, SiteFilesTreeItem, createWebSiteClient, getFile, type IDeleteSiteWizardContext } from "@microsoft/vscode-azext-azureappservice";
import { AppSettingTreeItem, AppSettingsTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { AzureWizard, DeleteConfirmationStep, callWithTelemetryAndErrorHandling, nonNullValue, type AzExtTreeItem, type IActionContext, type ISubscriptionContext, type TreeItemIconPath } from "@microsoft/vscode-azext-utils";
import { type ResolvedAppResourceBase } from "@microsoft/vscode-azext-utils/hostapi";
import { latestGAVersion, tryParseFuncVersion, type FuncVersion } from "../FuncVersion";
import { type FunctionAppQueryResponse } from "../FunctionAppResolver";
import { runFromPackageKey } from "../constants";
import { ext } from "../extensionVariables";
import { parseHostJson, type IParsedHostJson } from "../funcConfig/host";
import { localize } from "../localize";
import { createActivityContext } from "../utils/activityUtils";
import { envUtils } from "../utils/envUtils";
import { treeUtils } from "../utils/treeUtils";
import { type ApplicationSettings } from "./IProjectTreeItem";
import { ResolvedFunctionAppBase } from "./ResolvedFunctionAppBase";
import { type SlotTreeItem } from "./SlotTreeItem";
import { SlotsTreeItem } from "./SlotsTreeItem";
import { ProjectResource, ProjectSource, matchesAnyPart } from "./projectContextValues";
import { ManagedIdentityTreeItem } from "./remoteProject/ManagedIdentityTreeItem";
import { RemoteFunctionsTreeItem } from "./remoteProject/RemoteFunctionsTreeItem";

export function isResolvedFunctionApp(ti: unknown): ti is ResolvedFunctionAppResource {
    return (ti as unknown as ResolvedFunctionAppResource).instance === ResolvedFunctionAppResource.instance;
}

export class ResolvedFunctionAppResource extends ResolvedFunctionAppBase implements ResolvedAppResourceBase {
    private _site: ParsedSite;

    public data: Site;
    public queryResult: FunctionAppQueryResponse;

    private _subscription: ISubscriptionContext;
    public logStreamPath: string = '';
    public appSettingsTreeItem: AppSettingsTreeItem;
    public deploymentsNode: DeploymentsTreeItem | undefined;
    public readonly source: ProjectSource = ProjectSource.Remote;

    public static instance = 'resolvedFunctionApp';
    public readonly instance = ResolvedFunctionAppResource.instance;

    public contextValuesToAdd?: string[] | undefined;
    public maskedValuesToAdd: string[] = [];

    private _slotsTreeItem: SlotsTreeItem;
    private _functionsTreeItem: RemoteFunctionsTreeItem | undefined;
    private _logFilesTreeItem: LogFilesTreeItem;
    private _siteFilesTreeItem: SiteFilesTreeItem;
    private _managedIdentityTreeItem: ManagedIdentityTreeItem | undefined;

    private _cachedVersion: FuncVersion | undefined;
    private _cachedHostJson: IParsedHostJson | undefined;
    private _cachedIsConsumption: boolean | undefined;

    public static pickSlotContextValue: RegExp = new RegExp(/azFuncSlot(?!s)/);
    public static productionContextValue: string = 'azFuncProductionSlot';
    public static slotContextValue: string = 'azFuncSlot';
    public static flexContextValue: string = 'azFuncFlex';

    private _isFlex: boolean;

    commandId?: string | undefined;
    tooltip?: string | undefined;
    commandArgs?: unknown[] | undefined;

    public constructor(subscription: ISubscriptionContext, dataModel: FunctionAppQueryResponse | Site) {
        super();
        this._subscription = subscription;
        this.contextValuesToAdd = [];
        if ('pricingTier' in dataModel) {
            // dataModel is narrowed to QueryResult
            this._isFlex = dataModel.pricingTier === 'Flex Consumption';
            this.queryResult = dataModel;
            this.data = dataModel;
        } else {
            this._site = new ParsedSite(dataModel, subscription);
            this._isFlex = !!dataModel.functionAppConfig;
            this.data = this._site.rawSite;
            this.addValuesToMask(this._site);
        }

        if (this._isFlex) {
            this.contextValuesToAdd.push(ResolvedFunctionAppResource.flexContextValue);
        } else {
            this.contextValuesToAdd.push(ResolvedFunctionAppResource.productionContextValue);
        }
    }

    public async getSite(context: IActionContext): Promise<ParsedSite> {
        let site: ParsedSite | undefined = this._site;
        if (!site) {
            const webClient = await createWebSiteClient({ ...context, ...this._subscription });
            const rawSite = await webClient.webApps.get(this.queryResult.resourceGroup, this.queryResult.name);
            site = new ParsedSite(rawSite, this._subscription);
            this.data = rawSite;
            this._site = site;
            this.addValuesToMask(this._site);
        }

        return site;
    }

    private addValuesToMask(site: ParsedSite): void {
        const valuesToMask = [
            site.siteName, site.slotName, site.defaultHostName, site.resourceGroup,
            site.planName, site.planResourceGroup, site.kuduHostName, site.gitUrl,
            site.rawSite.repositorySiteName, ...(site.rawSite.hostNames || []), ...(site.rawSite.enabledHostNames || [])
        ];

        for (const v of valuesToMask) {
            if (v) {
                this.maskedValuesToAdd.push(v);
            }
        }
    }

    public get label(): string {
        return this._site?.slotName ?? this._site?.fullName ?? this.queryResult.name;
    }

    public get logStreamLabel(): string {
        return this._site.fullName ?? this.queryResult.name;
    }

    public get description(): string | undefined {
        if (this._isFlex) {
            return localize('flexFunctionApp', 'Flex Consumption');
        }
        return this._state?.toLowerCase() !== 'running' ? this._state : undefined;
    }

    public get iconPath(): TreeItemIconPath {
        const proxyTree: SlotTreeItem = this as unknown as SlotTreeItem;
        return treeUtils.getIconPath(proxyTree.contextValue);
    }

    private get _state(): string | undefined {
        return this._site?.rawSite.state ?? this.queryResult.status;
    }

    public get isFlex(): boolean {
        return this._isFlex;
    }

    /**
     * NOTE: We need to be extra careful in this method because it blocks many core scenarios (e.g. deploy) if the tree item is listed as invalid
     */
    public async refreshImpl(context: IActionContext): Promise<void> {
        this._cachedVersion = undefined;
        this._cachedHostJson = undefined;
        this._cachedIsConsumption = undefined;

        // on refresh, we should reinitialize the site to ensure we have the latest data
        const client = await this._site.createClient(context);
        this._site = new ParsedSite(nonNullValue(await client.getSite(), 'site'), this._subscription);
    }

    public async getVersion(context: IActionContext): Promise<FuncVersion> {
        let result: FuncVersion | undefined = this._cachedVersion;
        if (result === undefined) {
            let version: FuncVersion | undefined;
            try {
                const site = await this.getSite(context);
                const client = await site.createClient(context);
                const appSettings: StringDictionary = await client.listApplicationSettings();
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
                const site = await this.getSite(context);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                data = JSON.parse((await getFile(context, site, 'site/wwwroot/host.json')).data);
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
        const site = await this.getSite(context);
        const client = await site.createClient(context);
        const appSettings: StringDictionary = await client.listApplicationSettings();
        return appSettings.properties || {};
    }

    public async setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void> {
        const site = await this.getSite(context);
        const client = await site.createClient(context);
        const settings: StringDictionary = await client.listApplicationSettings();
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
                const site = await this.getSite(context);
                const client = await site.createClient(context);
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
        const site = await this.getSite(context);
        const client = await site.createClient(context);
        const siteConfig: SiteConfig = await client.getSiteConfig();
        const sourceControl: SiteSourceControl = await client.getSourceControl();
        const proxyTree: SlotTreeItem = this as unknown as SlotTreeItem;

        this.deploymentsNode = new DeploymentsTreeItem(proxyTree, {
            site,
            siteConfig,
            sourceControl,
            contextValuesToAdd: ['azFunc']
        });
        this.appSettingsTreeItem = await AppSettingsTreeItem.createAppSettingsTreeItem(context, proxyTree, site, ext.prefix, {
            contextValuesToAdd: ['azFunc'],
        });
        this._siteFilesTreeItem = new SiteFilesTreeItem(proxyTree, {
            site,
            isReadOnly: true,
            contextValuesToAdd: ['azFunc']
        });
        this._logFilesTreeItem = new LogFilesTreeItem(proxyTree, {
            site,
            contextValuesToAdd: ['azFunc']
        });

        if (!this._functionsTreeItem) {
            this._functionsTreeItem = await RemoteFunctionsTreeItem.createFunctionsTreeItem(context, proxyTree);
        }

        this._managedIdentityTreeItem = new ManagedIdentityTreeItem(proxyTree);

        const children: AzExtTreeItem[] = [this._functionsTreeItem, this._managedIdentityTreeItem, this.appSettingsTreeItem, this._siteFilesTreeItem];
        // Deployment configuration not supported by flex consumption at the time
        if (!this._isFlex) {
            children.push(this._logFilesTreeItem);
            children.push(this.deploymentsNode);
        }

        if (!site.isSlot && !this._isFlex) {
            this._slotsTreeItem = new SlotsTreeItem(proxyTree);
            children.push(this._slotsTreeItem);
        }

        return children;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        return await callWithTelemetryAndErrorHandling('functionApp.pickTreeItem', async (context: IActionContext) => {
            const site = await this.getSite(context);
            if (!site.isSlot) {
                for (const expectedContextValue of expectedContextValues) {
                    switch (expectedContextValue) {
                        case SlotsTreeItem.contextValue:
                        case ResolvedFunctionAppResource.slotContextValue:
                            return this._slotsTreeItem;
                        default:
                    }
                }
            }

            for (const expectedContextValue of expectedContextValues) {
                if (expectedContextValue instanceof RegExp) {
                    const appSettingsContextValues = [AppSettingsTreeItem.contextValue, AppSettingTreeItem.contextValue];
                    if (matchContextValue(expectedContextValue, appSettingsContextValues)) {
                        return this.appSettingsTreeItem;
                    }
                    const deploymentsContextValues = [DeploymentsTreeItem.contextValueConnected, DeploymentsTreeItem.contextValueUnconnected, DeploymentTreeItem.contextValue];
                    if (matchContextValue(expectedContextValue, deploymentsContextValues)) {
                        return this.deploymentsNode;
                    }

                    if (matchContextValue(expectedContextValue, [ResolvedFunctionAppResource.slotContextValue])) {
                        return this._slotsTreeItem;
                    }
                }

                if (typeof expectedContextValue === 'string') {
                    // DeploymentTreeItem.contextValue is a RegExp, but the passed in contextValue can be a string so check for a match
                    if (DeploymentTreeItem.contextValue.test(expectedContextValue)) {
                        return this.deploymentsNode;
                    }
                } else if (matchesAnyPart(expectedContextValue, ProjectResource.Functions, ProjectResource.Function)) {
                    return this._functionsTreeItem;
                }
            }

            return undefined;
        });
    }

    public compareChildrenImpl(): number {
        return 0; // already sorted
    }

    public async isReadOnly(context: IActionContext): Promise<boolean> {
        const site = await this.getSite(context);
        const client = await site.createClient(context);
        const appSettings: StringDictionary = await client.listApplicationSettings();
        return [runFromPackageKey, 'WEBSITE_RUN_FROM_ZIP'].some(key => appSettings.properties && envUtils.isEnvironmentVariableSet(appSettings.properties[key]));
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        const site = await this.getSite(context);
        const wizardContext: IDeleteSiteWizardContext = Object.assign(context, {
            site,
            ...(await createActivityContext())
        });

        const confirmationMessage: string = site.isSlot ?
            localize('confirmDeleteSlot', 'Are you sure you want to delete slot "{0}"?', site.fullName) :
            localize('confirmDeleteFunctionApp', 'Are you sure you want to delete function app "{0}"?', site.fullName);

        const title: string = site.isSlot ?
            localize('deleteSlot', 'Delete Slot "{0}"', site.fullName) :
            localize('deleteFunctionApp', 'Delete Function App "{0}"', site.fullName);

        const wizard = new AzureWizard(wizardContext, {
            promptSteps: [new DeleteConfirmationStep(confirmationMessage), new DeleteLastServicePlanStep()],
            executeSteps: [new DeleteSiteStep()],
            title
        });

        await wizard.prompt();
        await wizard.execute();
    }
}

export function matchContextValue(expectedContextValue: RegExp | string, matches: (string | RegExp)[]): boolean {
    if (expectedContextValue instanceof RegExp) {
        return matches.some((match) => {
            if (match instanceof RegExp) {
                return expectedContextValue.toString() === match.toString();
            }
            return expectedContextValue.test(match);
        });
    } else {
        return matches.some((match) => {
            if (match instanceof RegExp) {
                return match.test(expectedContextValue);
            }
            return expectedContextValue === match;
        });
    }
}
