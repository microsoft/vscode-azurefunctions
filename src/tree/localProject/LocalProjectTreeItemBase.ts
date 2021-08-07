/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { AzExtParentTreeItem, TreeItemIconPath } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';
import { isMultiRootWorkspace } from '../../utils/workspace';

export abstract class LocalProjectTreeItemBase extends AzExtParentTreeItem {
    public readonly label: string = localize('localProject', 'Local Project');
    public suppressMaskLabel: boolean = true;
    private readonly _projectName: string;
    private readonly _id: string;

    public constructor(parent: AzExtParentTreeItem, projectPath: string) {
        super(parent);
        this._projectName = isMultiRootWorkspace() ? `${path.basename(path.dirname(projectPath))}/${path.basename(projectPath)}` : path.basename(projectPath);
        this._id = 'localProject' + this._projectName;
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getThemedIconPath('CreateNewProject');
    }

    public get id(): string {
        return this._id;
    }

    public get description(): string {
        return this._projectName;
    }
}
