/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureTreeItem } from 'vscode-azureextensionui';
import { IFunctionBinding } from '../../FunctionConfig';
import { nonNullProp } from '../../utils/nonNull';
import { IProjectRoot } from './IProjectRoot';
import { LocalBindingsTreeItem } from './LocalBindingsTreeItem';

export class LocalBindingTreeItem extends AzureTreeItem<IProjectRoot> {
    public static contextValue: string = 'azFuncLocalBinding';
    public readonly contextValue: string = LocalBindingTreeItem.contextValue;

    private _binding: IFunctionBinding;
    private _name: string;

    public constructor(parent: LocalBindingsTreeItem, binding: IFunctionBinding) {
        super(parent);
        this._binding = binding;
        this._name = nonNullProp(binding, 'name');
    }

    public get id(): string {
        return this._name;
    }

    public get label(): string {
        return this._name;
    }

    public get description(): string | undefined {
        return this._binding.direction;
    }
}
