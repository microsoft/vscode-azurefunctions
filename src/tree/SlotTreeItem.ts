/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DeploymentsTreeItem, type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { type AppSettingsTreeItem } from '@microsoft/vscode-azext-azureappsettings';
import { type AzExtParentTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { treeUtils } from '../utils/treeUtils';
import { ResolvedFunctionAppResource } from './ResolvedFunctionAppResource';
import { SlotContainerTreeItemBase } from './SlotContainerTreeItemBase';
import { ProjectSource } from './projectContextValues';
import { type RemoteFunctionTreeItem } from './remoteProject/RemoteFunctionTreeItem';

export function isSlotTreeItem(treeItem: SlotTreeItem | RemoteFunctionTreeItem | AzExtParentTreeItem): treeItem is SlotTreeItem {
    return !!(treeItem as SlotTreeItem).site;
}

export class SlotTreeItem extends SlotContainerTreeItemBase {
    public logStreamPath: string = '';
    public readonly appSettingsTreeItem: AppSettingsTreeItem;
    public deploymentsNode: DeploymentsTreeItem | undefined;
    public readonly source: ProjectSource = ProjectSource.Remote;
    public site: ParsedSite;

    public readonly contextValue: string;

    public resolved: ResolvedFunctionAppResource;

    public constructor(parent: AzExtParentTreeItem, resolvedFunctionAppResource: ResolvedFunctionAppResource) {
        super(parent, resolvedFunctionAppResource);
        this.resolved = resolvedFunctionAppResource;
        // this is for the slotContextValue because it never gets resolved by the Resources extension
        const slotContextValue = this.resolved.site.isSlot ? ResolvedFunctionAppResource.slotContextValue : ResolvedFunctionAppResource.productionContextValue;
        const contextValues = [slotContextValue, 'slot'];
        this.contextValue = Array.from(new Set(contextValues)).sort().join(';');
        this.site = this.resolved.site as ParsedSite;
        this.iconPath = treeUtils.getIconPath(slotContextValue);
    }
    public get logStreamLabel(): string {
        return this.resolved.logStreamLabel;
    }

    public get description(): string | undefined {
        return this.resolved.description;
    }

    public async getSite(context: IActionContext): Promise<ParsedSite> {
        return await this.resolved.getSite(context);
    }

    /**
     * NOTE: We need to be extra careful in this method because it blocks many core scenarios (e.g. deploy) if the tree item is listed as invalid
     */
    public async refreshImpl(context: IActionContext): Promise<void> {
        return await this.resolved.refreshImpl(context);
    }

    public async getIsConsumption(context: IActionContext): Promise<boolean> {
        return await this.resolved.getIsConsumption(context);
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
