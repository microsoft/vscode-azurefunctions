/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { BindingTreeItem } from './BindingTreeItem';
import { FunctionTreeItemBase } from './FunctionTreeItemBase';
import { getProjectContextValue, ProjectResource } from './projectContextValues';

export class BindingsTreeItem extends AzExtParentTreeItem {
    public readonly label: string = localize('bindings', 'Bindings');
    public readonly childTypeLabel: string = localize('binding', 'binding');
    public readonly parent: FunctionTreeItemBase;

    public constructor(parent: FunctionTreeItemBase) {
        super(parent);
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.parent.source, this.parent.parent.access, ProjectResource.Bindings);
    }

    public get id(): string {
        return 'bindings';
    }

    public get iconPath(): treeUtils.IThemedIconPath {
        return treeUtils.getThemedIconPath('BulletList');
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<BindingTreeItem[]> {
        return this.parent.config.bindings.map(b => new BindingTreeItem(this, b));
    }
}
