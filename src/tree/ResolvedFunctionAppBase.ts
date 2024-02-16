/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { nonNullProp, nonNullValueAndProp, type AzExtTreeItem, type IActionContext, type TreeItemIconPath } from "@microsoft/vscode-azext-utils";
import { type ResolvedAppResourceBase } from "@microsoft/vscode-azext-utils/hostapi";
import { type ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import { type FuncVersion } from "../FuncVersion";
import { type IParsedHostJson } from "../funcConfig/host";
import { type ApplicationSettings, type FuncHostRequest } from "./IProjectTreeItem";
import { type ContainerSite } from "./containerizedFunctionApp/ResolvedContainerizedFunctionAppResource";

export abstract class ResolvedFunctionAppBase implements ResolvedAppResourceBase {
    public site: ContainerSite | ParsedSite;
    public constructor(site: ContainerSite | ParsedSite) {
        this.site = site;
    }

    public get name(): string {
        return this.label;
    }

    public abstract label: string;

    public get id(): string {
        return nonNullProp(this.site, 'id');
    }

    public abstract iconPath?: TreeItemIconPath | undefined;

    public abstract isReadOnly(context: IActionContext): Promise<boolean>;

    public get viewProperties(): ViewPropertiesModel {
        return {
            data: this.site,
            label: this.name,
        }
    }

    public abstract getHostJson(context: IActionContext): Promise<IParsedHostJson>;

    public abstract getVersion(context: IActionContext): Promise<FuncVersion>;

    public async getHostRequest(): Promise<FuncHostRequest> {
        return { url: nonNullValueAndProp(this.site, 'defaultHostUrl') }
    }

    public abstract getApplicationSettings(context: IActionContext): Promise<ApplicationSettings>;

    public abstract setApplicationSetting(context: IActionContext, key: string, value: string): Promise<void>;

    public abstract loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]>;

    public abstract deleteTreeItemImpl(context: IActionContext): Promise<void>;

    public abstract pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined>;

    public hasMoreChildrenImpl(): boolean {
        return false;
    }
}
