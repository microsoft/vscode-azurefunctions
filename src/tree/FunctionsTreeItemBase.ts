/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, TreeItemIconPath } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { IProjectTreeItem } from './IProjectTreeItem';
import { getProjectContextValue, ProjectAccess, ProjectResource } from './projectContextValues';

export abstract class FunctionsTreeItemBase extends AzExtParentTreeItem {
    public readonly label: string = localize('Functions', 'Functions');
    public readonly childTypeLabel: string = localize('Function', 'Function');
    public parent: AzExtParentTreeItem & IProjectTreeItem;

    public abstract isReadOnly: boolean;

    public constructor(parent: AzExtParentTreeItem & IProjectTreeItem) {
        super(parent);
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.source, this.access, ProjectResource.Functions);
    }

    public get description(): string {
        return this.isReadOnly ? localize('readOnly', 'Read-only') : '';
    }

    public get access(): ProjectAccess {
        return this.isReadOnly ? ProjectAccess.ReadOnly : ProjectAccess.ReadWrite;
    }

    public get id(): string {
        return 'functions';
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getThemedIconPath('list-unordered');
    }
}
