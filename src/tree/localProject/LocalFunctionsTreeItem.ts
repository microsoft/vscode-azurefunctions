/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { AzExtTreeItem } from 'vscode-azureextensionui';
import { functionJsonFileName } from '../../constants';
import { ParsedFunctionJson } from '../../funcConfig/function';
import { FunctionsTreeItemBase } from '../FunctionsTreeItemBase';
import { LocalFunctionTreeItem } from './LocalFunctionTreeItem';
import { LocalProjectTreeItem } from './LocalProjectTreeItem';

export class LocalFunctionsTreeItem extends FunctionsTreeItemBase {
    public readonly parent: LocalProjectTreeItem;
    public isReadOnly: boolean = false;

    public constructor(parent: LocalProjectTreeItem) {
        super(parent);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        const subpaths: string[] = await fse.readdir(this.parent.projectPath);

        const functions: string[] = [];
        await Promise.all(subpaths.map(async s => {
            if (await fse.pathExists(path.join(this.parent.projectPath, s, functionJsonFileName))) {
                functions.push(s);
            }
        }));

        return await this.createTreeItemsWithErrorHandling(
            functions,
            'azFuncInvalidLocalFunction',
            async func => {
                const functionJsonPath: string = path.join(this.parent.projectPath, func, functionJsonFileName);
                const config: ParsedFunctionJson = new ParsedFunctionJson(await fse.readJSON(functionJsonPath));
                return LocalFunctionTreeItem.create(this, func, config, functionJsonPath);
            },
            (func: string) => func
        );
    }
}
