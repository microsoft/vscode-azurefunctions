/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { AzExtParentTreeItem, AzExtTreeItem, TreeItemIconPath } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';

export class InvalidLocalProjectTreeItem extends AzExtParentTreeItem {
    public contextValue: string = 'invalidAzFuncLocalProject';
    public readonly label: string = localize('localProject', 'Local Project');

    private readonly _projectName: string;
    private readonly _projectError: unknown | undefined;

    public constructor(parent: AzExtParentTreeItem, projectPath: string, projectError: unknown) {
        super(parent);
        this._projectName = path.basename(projectPath);
        this._projectError = projectError;
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

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        throw this._projectError;
    }
}
