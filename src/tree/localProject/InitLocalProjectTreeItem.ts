/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GenericTreeItem, type AzExtParentTreeItem, type AzExtTreeItem } from '@microsoft/vscode-azext-utils';
import { ThemeIcon, type WorkspaceFolder } from 'vscode';
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
            label: localize('initProject', 'Initialize project for use with VS Code...'),
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
