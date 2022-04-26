/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Site, SiteConfig, SiteSourceControl, StringDictionary } from "@azure/arm-appservice";
import { AppSettingsTreeItem, AppSettingTreeItem, DeleteLastServicePlanStep, DeleteSiteStep, DeploymentsTreeItem, DeploymentTreeItem, getFile, IDeleteSiteWizardContext, LogFilesTreeItem, ParsedSite, SiteFilesTreeItem } from "@microsoft/vscode-azext-azureappservice";
import { AzExtTreeItem, AzureWizard, DeleteConfirmationStep, IActionContext, ISubscriptionContext, nonNullValue, TreeItemIconPath } from "@microsoft/vscode-azext-utils";
import { ResolvedAppResourceBase } from "@microsoft/vscode-azext-utils/hostapi";
import { runFromPackageKey } from "../constants";
import { IParsedHostJson, parseHostJson } from "../funcConfig/host";
import { FuncVersion, latestGAVersion, tryParseFuncVersion } from "../FuncVersion";
import { localize } from "../localize";
import { createActivityContext } from "../utils/activityUtils";
import { envUtils } from "../utils/envUtils";
import { treeUtils } from "../utils/treeUtils";
import { ApplicationSettings, FuncHostRequest } from "./IProjectTreeItem";
import { matchesAnyPart, ProjectResource, ProjectSource } from "./projectContextValues";
import { RemoteFunctionsTreeItem } from "./remoteProject/RemoteFunctionsTreeItem";
import { SlotsTreeItem } from "./SlotsTreeItem";
import { SlotTreeItem } from "./SlotTreeItem";

export class ResolvedFunctionAppResource implements ResolvedAppResourceBase {
    public site: ParsedSite;
    private _subscription: ISubscriptionContext;
    public logStreamPath: string = '';
    public appSettingsTreeItem: AppSettingsTreeItem;
    public deploymentsNode: DeploymentsTreeItem | undefined;
    public readonly source: ProjectSource = ProjectSource.Remote;

    public contextValuesToAdd?: string[] | undefined;
    public maskedValuesToAdd: string[] = [];

    private _slotsTreeItem: SlotsTreeItem;
    private _functionsTreeItem: RemoteFunctionsTreeItem | undefined;
    private _logFilesTreeItem: LogFilesTreeItem;
    private _siteFilesTreeItem: SiteFilesTreeItem;

    private _cachedVersion: FuncVersion | undefined;
    private _cachedHostJson: IParsedHostJson | undefined;
    private _cachedIsConsumption: boolean | undefined;

    public static productionContextValue: string = 'azFuncProductionSlot';
    public static slotContextValue: string = 'azFuncSlot';

    commandId?: string | undefined;
    tooltip?: string | undefined;
    commandArgs?: unknown[] | undefined;

    public constructor(subscription: ISubscriptionContext, site: Site) {
        this.site = new ParsedSite(site, subscription);
        this._subscription = subscription;
        this.contextValuesToAdd = [this.site.isSlot ? ResolvedFunctionAppResource.slotContextValue : ResolvedFunctionAppResource.productionContextValue];

        const valuesToMask = [
            this.site.siteName, this.site.slotName, this.site.defaultHostName, this.site.resourceGroup,
            this.site.planName, this.site.planResourceGroup, this.site.kuduHostName, this.site.gitUrl,
            this.site.rawSite.repositorySiteName, ...(this.site.rawSite.hostNames || []), ...(this.site.rawSite.enabledHostNames || [])
        ];


        for (const v of valuesToMask) {
            if (v) {
                this.maskedValuesToAdd.push(v);
            }
        }
    }

    public get name(): string {
        return this.label;
    }

    public get label(): string {
        return this.site.slotName ?? this.site.fullName;
    }

    public get id(): string {
        return this.site.id;
    }

    public get logStreamLabel(): string {
        return this.site.fullName;
    }

    public async getHostRequest(): Promise<FuncHostRequest> {
        return { url: this.site.defaultHostUrl };
    }

    public get description(): string | undefined {
        return this._state?.toLowerCase() !== 'running' ? this._state : undefined;
    }

    public get iconPath(): TreeItemIconPath {
        const proxyTree: SlotTreeItem = this as unknown as SlotTreeItem;
        return treeUtils.getIconPath(proxyTree.contextValue);
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
        this.site = new ParsedSite(nonNullValue(await client.getSite(), 'site'), this._subscription);
    }

    public async getVersion(context: IActionContext): Promise<FuncVersion> {
        let result: FuncVersion | undefined = this._cachedVersion;
        if (result === undefined) {
            let version: FuncVersion | undefined;
            try {
                const client = await this.site.createClient(context);
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
        const appSettings: StringDictionary = await client.listApplicationSettings();
        return appSettings.properties || {};
    }

    public async setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void> {
        const client = await this.site.createClient(context);
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
        const siteConfig: SiteConfig = await client.getSiteConfig();
        const sourceControl: SiteSourceControl = await client.getSourceControl();
        const proxyTree: SlotTreeItem = this as unknown as SlotTreeItem;

        this.deploymentsNode = new DeploymentsTreeItem(proxyTree, {
            site: this.site,
            siteConfig,
            sourceControl,
            contextValuesToAdd: ['azFunc']
        });
        this.appSettingsTreeItem = new AppSettingsTreeItem(proxyTree, this.site, {
            contextValuesToAdd: ['azFunc']
        });
        this._siteFilesTreeItem = new SiteFilesTreeItem(proxyTree, {
            site: this.site,
            isReadOnly: true,
            contextValuesToAdd: ['azFunc']
        });
        this._logFilesTreeItem = new LogFilesTreeItem(proxyTree, {
            site: this.site,
            contextValuesToAdd: ['azFunc']
        });

        if (!this._functionsTreeItem) {
            this._functionsTreeItem = await RemoteFunctionsTreeItem.createFunctionsTreeItem(context, proxyTree);
        }

        const children: AzExtTreeItem[] = [this._functionsTreeItem, this.appSettingsTreeItem, this._siteFilesTreeItem, this._logFilesTreeItem, this.deploymentsNode];
        if (!this.site.isSlot) {
            this._slotsTreeItem = new SlotsTreeItem(proxyTree);
            children.push(this._slotsTreeItem);
        }

        return children;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        if (!this.site.isSlot) {
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
    }

    public compareChildrenImpl(): number {
        return 0; // already sorted
    }

    public async isReadOnly(context: IActionContext): Promise<boolean> {
        const client = await this.site.createClient(context);
        const appSettings: StringDictionary = await client.listApplicationSettings();
        return [runFromPackageKey, 'WEBSITE_RUN_FROM_ZIP'].some(key => appSettings.properties && envUtils.isEnvironmentVariableSet(appSettings.properties[key]));
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        const wizardContext: IDeleteSiteWizardContext = Object.assign(context, {
            site: this.site,
            ...(await createActivityContext())
        });

        const confirmationMessage = localize('deleteConfirmation', 'Are you sure you want to delete function app "{0}"?', this.site.fullName);

        const wizard = new AzureWizard(wizardContext, {
            title: localize('deleteSwa', 'Delete Function App "{0}"', this.label),
            promptSteps: [new DeleteConfirmationStep(confirmationMessage), new DeleteLastServicePlanStep()],
            executeSteps: [new DeleteSiteStep()]
        });

        await wizard.prompt();
        await wizard.execute();
    }
}

function matchContextValue(expectedContextValue: RegExp | string, matches: (string | RegExp)[]): boolean {
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
