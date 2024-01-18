/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site } from "@azure/arm-appservice";
import { AzExtParentTreeItem, type AzExtTreeItem, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type FuncVersion } from "../../FuncVersion";
import { type IParsedHostJson } from "../../funcConfig/host";
import { type ApplicationSettings, type FuncHostRequest, type IProjectTreeItem } from "../IProjectTreeItem";
import { ProjectSource } from "../projectContextValues";
import { type ResolvedContainerizedFunctionAppResource } from "./ResolvedContainerizedFunctionAppResourceBase";

export class ContainerTreeItem extends AzExtParentTreeItem implements IProjectTreeItem {
    public resolved: ResolvedContainerizedFunctionAppResource;
    public readonly contextValue: string;
    public site: Site

    public readonly source: ProjectSource = ProjectSource.Remote;

    public constructor(parent: AzExtParentTreeItem, resolvedContainerizedFunctionAppResource: ResolvedContainerizedFunctionAppResource) {
        super(parent);
        this.resolved = resolvedContainerizedFunctionAppResource;
        this.contextValue = 'azFuncContainer';
        this.site = this.resolved.site;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        return await this.resolved.loadMoreChildrenImpl.call(this, _clearCache, context) as AzExtTreeItem[];
    }

    public hasMoreChildrenImpl(): boolean {
        return this.resolved.hasMoreChildrenImpl();
    }

    public get label(): string {
        return this.resolved.label;
    }

    public get id(): string {
        return this.resolved.id;
    }

    public async isReadOnly(context: IActionContext): Promise<boolean> {
        return await this.resolved.isReadOnly(context);
    }

    public async getHostRequest(): Promise<FuncHostRequest> {
        return await this.resolved.getHostRequest();
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
}
