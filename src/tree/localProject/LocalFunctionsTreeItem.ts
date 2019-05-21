/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { AzExtTreeItem } from 'vscode-azureextensionui';
import { functionJsonFileName } from '../../constants';
import { ParsedFunctionJson } from '../../funcConfig/function';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';
import { LocalFunctionTreeItem } from './LocalFunctionTreeItem';
import { LocalParentTreeItem } from './LocalTreeItem';

export class LocalFunctionsTreeItem extends LocalParentTreeItem {
    public static contextValue: string = 'azFuncLocalFunctions';
    public readonly contextValue: string = LocalFunctionsTreeItem.contextValue;
    public readonly label: string = localize('functions', 'Functions');
    public readonly childTypeLabel: string = localize('function', 'function');

    public get id(): string {
        return 'functions';
    }

    public get iconPath(): treeUtils.IThemedIconPath {
        return treeUtils.getThemedIconPath('BulletList');
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        const subpaths: string[] = await fse.readdir(this.root.projectPath);

        const functions: string[] = [];
        await Promise.all(subpaths.map(async s => {
            if (await fse.pathExists(path.join(this.root.projectPath, s, functionJsonFileName))) {
                functions.push(s);
            }
        }));

        return await this.createTreeItemsWithErrorHandling(
            functions,
            'azFuncInvalidLocalFunction',
            async func => {
                const functionJsonPath: string = path.join(this.root.projectPath, func, functionJsonFileName);
                const config: ParsedFunctionJson = new ParsedFunctionJson(await fse.readJSON(functionJsonPath));
                return new LocalFunctionTreeItem(this, func, config, functionJsonPath);
            },
            (func: string) => func
        );
    }
}
