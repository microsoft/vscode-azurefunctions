/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem } from 'vscode-azureextensionui';
import { IFunctionBinding } from '../funcConfig/function';
import { nonNullProp } from '../utils/nonNull';
import { BindingsTreeItem } from './BindingsTreeItem';
import { getProjectContextValue, ProjectResource } from './projectContextValues';

export class BindingTreeItem extends AzExtTreeItem {
    public readonly parent: BindingsTreeItem;
    public binding: IFunctionBinding;

    private readonly _name: string;

    public constructor(parent: BindingsTreeItem, binding: IFunctionBinding) {
        super(parent);
        this.binding = binding;
        this._name = nonNullProp(binding, 'name');
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.parent.parent.source, this.parent.parent.parent.access, ProjectResource.Binding);
    }

    public get id(): string {
        return this._name;
    }

    public get label(): string {
        return this._name;
    }

    public get description(): string | undefined {
        return this.binding.direction;
    }
}
