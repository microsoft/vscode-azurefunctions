/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, IContextValue, IExpectedContextValue, TreeItemIconPath } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { AppPerms } from './contextValues';
import { FunctionTreeItemBase } from './FunctionTreeItemBase';
import { IProjectTreeItem } from './IProjectTreeItem';

export abstract class FunctionsTreeItemBase extends AzExtParentTreeItem {
    public static contextValueId: string = 'functions';
    public readonly label: string = localize('Functions', 'Functions');
    public readonly childTypeLabel: string = localize('Function', 'Function');
    public parent: AzExtParentTreeItem & IProjectTreeItem;

    public abstract isReadOnly: boolean;

    public constructor(parent: AzExtParentTreeItem & IProjectTreeItem) {
        super(parent);
    }

    public get contextValue(): IContextValue {
        return {
            id: FunctionsTreeItemBase.contextValueId,
            perms: this.isReadOnly ? AppPerms.readOnly : AppPerms.readWrite
        };
    }

    public get description(): string {
        return this.isReadOnly ? localize('readOnly', 'Read-only') : '';
    }

    public get id(): string {
        return 'functions';
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getThemedIconPath('list-unordered');
    }

    public isAncestorOfImpl(expectedContextValue: IExpectedContextValue): boolean {
        return expectedContextValue.id === FunctionTreeItemBase.contextValueId;
    }
}
