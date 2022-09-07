/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingsTreeItem, DeploymentsTreeItem, ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { AzExtParentTreeItem, AzExtTreeItem, IActionContext } from '@microsoft/vscode-azext-utils';
import { IParsedHostJson } from '../funcConfig/host';
import { FuncVersion } from '../FuncVersion';
import { treeUtils } from '../utils/treeUtils';
import { ApplicationSettings, FuncHostRequest, IProjectTreeItem } from './IProjectTreeItem';
import { ProjectSource } from './projectContextValues';
import { RemoteFunctionTreeItem } from './remoteProject/RemoteFunctionTreeItem';
import { ResolvedFunctionAppResource } from './ResolvedFunctionAppResource';

export function isSlotTreeItem(treeItem: SlotTreeItem | RemoteFunctionTreeItem | AzExtParentTreeItem): treeItem is SlotTreeItem {
    return !!(treeItem as SlotTreeItem).site;
}

export class SlotTreeItem extends AzExtParentTreeItem implements IProjectTreeItem {
    public logStreamPath: string = '';
    public readonly appSettingsTreeItem: AppSettingsTreeItem;
    public deploymentsNode: DeploymentsTreeItem | undefined;
    public readonly source: ProjectSource = ProjectSource.Remote;
    public site: ParsedSite;

    public readonly contextValue: string;
    public readonly childTypeLabel: string;

    public resolved: ResolvedFunctionAppResource;

    public constructor(parent: AzExtParentTreeItem, resolvedFunctionAppResource: ResolvedFunctionAppResource) {
        super(parent);
        this.resolved = resolvedFunctionAppResource;
        // this is for the slotContextValue because it never gets resolved by the Resources extension
        const slotContextValue = this.resolved.site.isSlot ? ResolvedFunctionAppResource.slotContextValue : ResolvedFunctionAppResource.productionContextValue;
        const contextValues = [slotContextValue, 'slot'];
        this.contextValue = Array.from(new Set(contextValues)).sort().join(';');
        this.site = this.resolved.site;
        this.iconPath = treeUtils.getIconPath(slotContextValue);
        this.childTypeLabel = this.resolved.childTypeLabel;
    }

    public get label(): string {
        return this.resolved.label;
    }

    public get logStreamLabel(): string {
        return this.resolved.logStreamLabel;
    }

    public get id(): string {
        return this.resolved.id;
    }

    public async getHostRequest(): Promise<FuncHostRequest> {
        return await this.resolved.getHostRequest();
    }

    public get description(): string | undefined {
        return this.resolved.description;
    }

    public hasMoreChildrenImpl(): boolean {
        return this.resolved.hasMoreChildrenImpl();
    }

    /**
     * NOTE: We need to be extra careful in this method because it blocks many core scenarios (e.g. deploy) if the tree item is listed as invalid
     */
    public async refreshImpl(context: IActionContext): Promise<void> {
        return await this.resolved.refreshImpl(context);
    }

    public async getVersion(context: IActionContext): Promise<FuncVersion> {
        return await this.resolved.getVersion(context);
    }

    public async getHostJson(context: IActionContext): Promise<IParsedHostJson> {
        return await this.resolved.getHostJson(context);
    }

    public async getApplicationSettings(context: IActionContext): Promise<ApplicationSettings> {
        return await this.resolved.getApplicationSettings(context);
    }

    public async setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void> {
        return await this.resolved.setApplicationSetting(context, key, value);
    }

    public async getIsConsumption(context: IActionContext): Promise<boolean> {
        return await this.resolved.getIsConsumption(context);
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        return await this.resolved.loadMoreChildrenImpl.call(this, _clearCache, context) as AzExtTreeItem[];
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        return await this.resolved.pickTreeItemImpl(expectedContextValues);
    }

    public compareChildrenImpl(): number {
        return this.resolved.compareChildrenImpl();
    }

    public async isReadOnly(context: IActionContext): Promise<boolean> {
        return await this.resolved.isReadOnly(context);
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        await this.resolved.deleteTreeItemImpl(context);
    }
}
