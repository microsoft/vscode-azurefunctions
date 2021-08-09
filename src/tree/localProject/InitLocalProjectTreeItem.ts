/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon, WorkspaceFolder } from 'vscode';
import { AzExtParentTreeItem, AzExtTreeItem, GenericTreeItem } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { isLocalProjectCV } from '../projectContextValues';
import { LocalProjectTreeItemBase } from './LocalProjectTreeItemBase';

export class InitLocalProjectTreeItem extends LocalProjectTreeItemBase {
    public contextValue: string = 'initAzFuncLocalProject';

    private readonly _projectPath: string;

    public constructor(parent: AzExtParentTreeItem, projectPath: string, folder: WorkspaceFolder) {
        super(parent, projectPath, folder);
        this._projectPath = projectPath;
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        const ti: GenericTreeItem = new GenericTreeItem(this, {
            contextValue: 'initProject',
            label: localize('initProject', 'Initialize Project for Use with VS Code...'),
            commandId: 'azureFunctions.initProjectForVSCode',
            iconPath: new ThemeIcon('warning')
        });
        ti.commandArgs = [this._projectPath];
        return [ti];
    }

    public isAncestorOfImpl(contextValue: string | RegExp): boolean {
        return isLocalProjectCV(contextValue);
    }
}
