/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, nonNullValueAndProp, type AzExtTreeItem, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type FuncVersion } from "../FuncVersion";
import { type IParsedHostJson } from "../funcConfig/host";
import { type ApplicationSettings, type FuncHostRequest, type IProjectTreeItem } from "./IProjectTreeItem";
import { type ResolvedFunctionAppResource } from "./ResolvedFunctionAppResource";
import { type ResolvedContainerizedFunctionAppResource } from "./containerizedFunctionApp/ResolvedContainerizedFunctionAppResourceBase";
import { ProjectSource } from "./projectContextValues";

export class SlotContainerTreeItemBase extends AzExtParentTreeItem implements IProjectTreeItem {
    public contextValue: string;
    public resolved: ResolvedFunctionAppResource | ResolvedContainerizedFunctionAppResource;
    public readonly source: ProjectSource = ProjectSource.Remote;

    public constructor(parent: AzExtParentTreeItem, resolvedFunctionAppResource: ResolvedFunctionAppResource | ResolvedContainerizedFunctionAppResource) {
        super(parent);
        this.resolved = resolvedFunctionAppResource;
    }

    public get label(): string {
        return this.resolved.label;
    }

    public get id(): string {
        return this.resolved.id;
    }

    public hasMoreChildrenImpl(): boolean {
        return this.resolved.hasMoreChildrenImpl();
    }

    public async getHostRequest(): Promise<FuncHostRequest> {
        return await this.resolved.getHostRequest();
    }

    public get defaultHostUrl(): string {
        return nonNullValueAndProp(this.resolved.site, 'defaultHostUrl');
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        return await this.resolved.loadMoreChildrenImpl.call(this, _clearCache, context) as AzExtTreeItem[];
    }

    public async getHostJson(context: IActionContext): Promise<IParsedHostJson> {
        return await this.resolved.getHostJson(context);
    }

    public async getVersion(context: IActionContext): Promise<FuncVersion> {
        return await this.resolved.getVersion(context);
    }

    public async getApplicationSettings(context: IActionContext): Promise<ApplicationSettings> {
        return await this.resolved.getApplicationSettings(context);
    }

    public async setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void> {
        return await this.resolved.setApplicationSetting(context, key, value);
    }

    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        return await this.resolved.pickTreeItemImpl(expectedContextValues);
    }
}
