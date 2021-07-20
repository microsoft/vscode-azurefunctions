/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import * as fse from 'fs-extra';
import * as path from 'path';
import { ThemeIcon } from 'vscode';
import { AzExtTreeItem, GenericTreeItem, IActionContext } from 'vscode-azureextensionui';
import { functionJsonFileName } from '../../constants';
import { ParsedFunctionJson } from '../../funcConfig/function';
import { runningFuncTaskMap } from '../../funcCoreTools/funcHostTask';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { requestUtils } from '../../utils/requestUtils';
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

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (this.parent.isIsolated) {
            return await this.getChildrenForIsolatedProject(context);
        } else {
            const functions: string[] = await getFunctionFolders(this.parent.effectiveProjectPath);
            const children: AzExtTreeItem[] = await this.createTreeItemsWithErrorHandling(
                functions,
                'azFuncInvalidLocalFunction',
                async func => {
                    const functionJsonPath: string = path.join(this.parent.effectiveProjectPath, func, functionJsonFileName);
                    const config: ParsedFunctionJson = new ParsedFunctionJson(await fse.readJSON(functionJsonPath));
                    return LocalFunctionTreeItem.create(context, this, func, config, functionJsonPath, undefined);
                },
                (func: string) => func
            );

            if (this.parent.preCompiledProjectPath) {
                const ti: GenericTreeItem = new GenericTreeItem(this, {
                    label: localize('runBuildTask', 'Run build task to update this list...'),
                    iconPath: new ThemeIcon('info'),
                    commandId: 'workbench.action.tasks.build',
                    contextValue: 'runBuildTask'
                });
                // By default `GenericTreeItem` will pass itself as the args, but VS Code doesn't seem to like that so pass empty array
                ti.commandArgs = [];
                children.push(ti);
            }

            return children;
        }
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

    /**
     * .NET Isolated projects don't have typical "function.json" files, so we'll have to ping localhost to get functions (only available if the project is running)
     */
    private async getChildrenForIsolatedProject(context: IActionContext): Promise<AzExtTreeItem[]> {
        if (runningFuncTaskMap.has(this.parent.workspaceFolder)) {
            const hostUrl = await this.parent.getHostUrl(context);
            const functions = await requestUtils.sendRequestWithExtTimeout({
                url: `${hostUrl}/admin/functions`,
                method: 'GET'
            });
            return await this.createTreeItemsWithErrorHandling(
                <WebSiteManagementModels.FunctionEnvelope[]>functions.parsedBody,
                'azFuncInvalidLocalFunction',
                async func => {
                    func = requestUtils.convertToAzureSdkObject(func);
                    return LocalFunctionTreeItem.create(context, this, nonNullProp(func, 'name'), func.config, undefined, func);
                },
                func => func.name
            );
        } else {
            const ti: GenericTreeItem = new GenericTreeItem(this, {
                label: localize('startDebugging', 'Start debugging to update this list...'),
                iconPath: new ThemeIcon('info'),
                commandId: 'workbench.action.debug.start',
                contextValue: 'startDebugging'
            });
            // By default `GenericTreeItem` will pass itself as the args, but VS Code doesn't seem to like that so pass empty array
            ti.commandArgs = [];
            return [ti];
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
