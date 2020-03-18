/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzExtTreeItem, GenericTreeItem } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';
import { LocalProjectTreeItemBase } from './LocalProjectTreeItemBase';

export class InitLocalProjectTreeItem extends LocalProjectTreeItemBase {
    public contextValue: string = 'initAzFuncLocalProject';

    private readonly _projectPath: string;

    public constructor(parent: AzExtParentTreeItem, projectPath: string) {
        super(parent, projectPath);
        this._projectPath = projectPath;
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        const ti: GenericTreeItem = new GenericTreeItem(this, {
            contextValue: 'initProject',
            label: localize('initProject', 'Initialize Project for Use with VS Code...'),
            commandId: 'azureFunctions.initProjectForVSCode',
            iconPath: treeUtils.getThemedIconPath('warning')
        });
        ti.commandArgs = [this._projectPath];
        return [ti];
    }
}
