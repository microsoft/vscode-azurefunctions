/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { WorkspaceFolder } from 'vscode';
import { AzExtParentTreeItem, TreeItemIconPath } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';

export abstract class LocalProjectTreeItemBase extends AzExtParentTreeItem {
    public readonly label: string = localize('localProject', 'Local Project');
    public suppressMaskLabel: boolean = true;
    private readonly _projectSubpath: string;
    private readonly _id: string;

    public constructor(parent: AzExtParentTreeItem, projectPath: string, folder: WorkspaceFolder) {
        super(parent);
        this._projectSubpath = path.relative(path.dirname(folder.uri.fsPath), projectPath);
        this._id = 'localProject' + this._projectSubpath;
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getThemedIconPath('CreateNewProject');
    }

    public get id(): string {
        return this._id;
    }

    public get description(): string {
        return this._projectSubpath;
    }
}
