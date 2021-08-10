/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceFolder } from 'vscode';
import { AzExtParentTreeItem, AzExtTreeItem } from 'vscode-azureextensionui';
import { LocalProjectTreeItemBase } from './LocalProjectTreeItemBase';

export class InvalidLocalProjectTreeItem extends LocalProjectTreeItemBase {
    public contextValue: string = 'invalidAzFuncLocalProject';

    private readonly _projectError: unknown | undefined;

    public constructor(parent: AzExtParentTreeItem, projectPath: string, projectError: unknown, folder: WorkspaceFolder) {
        super(parent, projectPath, folder);
        this._projectError = projectError;
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        throw this._projectError;
    }
}
