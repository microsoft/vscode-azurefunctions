/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceFolder } from "vscode";
import { AzExtParentTreeItem, AzExtTreeItem } from "vscode-azureextensionui";
import { nonNullProp } from "../../utils/nonNull";

export interface IProjectRoot {
    projectPath: string;
    workspacePath: string;
    workspaceFolder: WorkspaceFolder;
}

export abstract class LocalTreeItem<TRoot extends IProjectRoot = IProjectRoot> extends AzExtTreeItem {
    public readonly parent: LocalParentTreeItem<TRoot> | undefined;

    public get root(): TRoot {
        return nonNullProp(this, 'parent').root;
    }
}

export abstract class LocalParentTreeItem<TRoot extends IProjectRoot = IProjectRoot> extends AzExtParentTreeItem {
    public readonly parent: LocalParentTreeItem<TRoot> | undefined;

    public get root(): TRoot {
        return nonNullProp(this, 'parent').root;
    }
}

export function isLocalTreeItem(contextValue: string | RegExp): boolean {
    return typeof contextValue === 'string' && /^azFuncLocal/.test(contextValue);
}
