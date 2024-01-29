/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site } from "@azure/arm-appservice";
import { AzExtParentTreeItem, GenericTreeItem, createContextValue, nonNullValue, type AzExtTreeItem, type TreeItemIconPath } from "@microsoft/vscode-azext-utils";
import { ThemeIcon } from "vscode";
import { localize } from "../../localize";

export class ImageTreeItem extends AzExtParentTreeItem {
    constructor(parent: AzExtParentTreeItem, public readonly site: Site, private readonly contextValuesToAdd: string[]) {
        super(parent);
    }

    public async loadMoreChildrenImpl(): Promise<AzExtTreeItem[]> {
        const imageInfo = this.site.siteConfig?.linuxFxVersion?.split('|')[1];
        const loginServer = imageInfo?.split('/')[0];
        const imageAndTag = imageInfo?.substring(nonNullValue(loginServer?.length) + 1, imageInfo?.length);

        return [
            new GenericTreeItem(this, {
                label: localize('registry', 'Registry'),
                description: loginServer,
                contextValue: localize('registry', 'registry'),
                iconPath: new ThemeIcon('dash')
            }),
            new GenericTreeItem(this, {
                label: localize('name', 'Name'),
                description: imageAndTag,
                contextValue: localize('name', 'name'),
                iconPath: new ThemeIcon('dash')
            })
        ]
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public get contextValue(): string {
        return createContextValue(['imageTreeItem', ...this.contextValuesToAdd]);
    }

    public get label(): string {
        return localize('image', 'Image');
    }

    public get description(): string | undefined {
        return 'Read-only'
    }

    public get iconPath(): TreeItemIconPath {
        return new ThemeIcon('window');
    }
}
