/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { AzExtTreeItem, GenericTreeItem } from 'vscode-azureextensionui';
import { functionJsonFileName } from '../../constants';
import { ParsedFunctionJson } from '../../funcConfig/function';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';
import { FunctionsTreeItemBase } from '../FunctionsTreeItemBase';
import { LocalFunctionTreeItem } from './LocalFunctionTreeItem';
import { LocalProjectTreeItem } from './LocalProjectTreeItem';

export class LocalFunctionsTreeItem extends FunctionsTreeItemBase {
    public readonly parent: LocalProjectTreeItem;
    public isReadOnly: boolean;

    public constructor(parent: LocalProjectTreeItem) {
        super(parent);
        this.isReadOnly = !!this.parent.preCompiledProjectPath;
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        const functions: string[] = await getFunctionFolders(this.parent.effectiveProjectPath);
        const children: AzExtTreeItem[] = await this.createTreeItemsWithErrorHandling(
            functions,
            'azFuncInvalidLocalFunction',
            async func => {
                const functionJsonPath: string = path.join(this.parent.effectiveProjectPath, func, functionJsonFileName);
                const config: ParsedFunctionJson = new ParsedFunctionJson(await fse.readJSON(functionJsonPath));
                return LocalFunctionTreeItem.create(this, func, config, functionJsonPath);
            },
            (func: string) => func
        );

        if (this.parent.preCompiledProjectPath) {
            const ti: GenericTreeItem = new GenericTreeItem(this, {
                label: localize('runBuildTask', 'Run build task to update this list...'),
                iconPath: treeUtils.getThemedIconPath('info'),
                commandId: 'workbench.action.tasks.build',
                contextValue: 'runBuildTask'
            });
            // By default `GenericTreeItem` will pass itself as the args, but VS Code doesn't seem to like that so pass empty array
            ti.commandArgs = [];
            children.push(ti);
        }

        return children;
    }

    public compareChildrenImpl(item1: AzExtTreeItem, item2: AzExtTreeItem): number {
        if (item1 instanceof GenericTreeItem && !(item2 instanceof GenericTreeItem)) {
            return -1;
        } else if (!(item1 instanceof GenericTreeItem) && item2 instanceof GenericTreeItem) {
            return 1;
        } else {
            return super.compareChildrenImpl(item1, item2);
        }
    }
}

export async function getFunctionFolders(projectPath: string): Promise<string[]> {
    const result: string[] = [];
    if (await fse.pathExists(projectPath)) {
        const subpaths: string[] = await fse.readdir(projectPath);
        await Promise.all(subpaths.map(async s => {
            if (await fse.pathExists(path.join(projectPath, s, functionJsonFileName))) {
                result.push(s);
            }
        }));
    }
    return result;
}
