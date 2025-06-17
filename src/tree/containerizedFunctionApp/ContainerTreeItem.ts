/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type AzExtParentTreeItem } from "@microsoft/vscode-azext-utils";
import { SlotContainerTreeItemBase } from "../SlotContainerTreeItemBase";
import { ProjectSource } from "../projectContextValues";
import { type ContainerSite, type ResolvedContainerizedFunctionAppResource } from "./ResolvedContainerizedFunctionAppResource";

export class ContainerTreeItem extends SlotContainerTreeItemBase {
    public resolved: ResolvedContainerizedFunctionAppResource;
    public readonly contextValue: string;
    public site: ContainerSite;

    public readonly source: ProjectSource = ProjectSource.Remote;

    public constructor(parent: AzExtParentTreeItem, resolvedContainerizedFunctionAppResource: ResolvedContainerizedFunctionAppResource) {
        super(parent, resolvedContainerizedFunctionAppResource);
        this.resolved = resolvedContainerizedFunctionAppResource;
        this.contextValue = 'azFuncContainer';
        this.site = this.resolved.site;
    }

    public async isReadOnly(): Promise<boolean> {
        return await this.resolved.isReadOnly();
    }

    public getSite(): ContainerSite {
        return this.resolved.site;
    }
}
