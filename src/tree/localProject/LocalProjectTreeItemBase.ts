/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { AzExtParentTreeItem, TreeItemIconPath } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';

export abstract class LocalProjectTreeItemBase extends AzExtParentTreeItem {
    public readonly label: string = localize('localProject', 'Local Project');
    private readonly _projectName: string;

    public constructor(parent: AzExtParentTreeItem, projectPath: string) {
        super(parent);
        this._projectName = path.basename(projectPath);
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getThemedIconPath('CreateNewProject');
    }

    public get id(): string {
        return 'localProject' + this._projectName;
    }

    public get description(): string {
        return this._projectName;
    }
}
