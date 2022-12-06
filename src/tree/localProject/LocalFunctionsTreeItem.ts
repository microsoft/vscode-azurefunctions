/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope } from '@azure/arm-appservice';
import { AzExtFsExtra, AzExtTreeItem, GenericTreeItem, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ThemeIcon } from 'vscode';
import { functionJsonFileName } from '../../constants';
import { ParsedFunctionJson } from '../../funcConfig/function';
import { runningFuncTaskMap } from '../../funcCoreTools/funcHostTask';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { pythonUtils } from '../../utils/pythonUtils';
import { requestUtils } from '../../utils/requestUtils';
import { telemetryUtils } from '../../utils/telemetryUtils';
import { findFiles } from '../../utils/workspace';
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
        const isParentPythonV2Plus = pythonUtils.isV2Plus(this.parent.language, this.parent.languageModel);

        if (this.parent.isIsolated || isParentPythonV2Plus) {
            return await this.getChildrenForHostedProjects(context);
        } else {
            const functions: string[] = await getFunctionFolders(context, this.parent.effectiveProjectPath);
            const children: AzExtTreeItem[] = await this.createTreeItemsWithErrorHandling(
                functions,
                'azFuncInvalidLocalFunction',
                async func => {
                    const functionJsonPath: string = path.join(this.parent.effectiveProjectPath, func, functionJsonFileName);
                    const config: ParsedFunctionJson = new ParsedFunctionJson(await AzExtFsExtra.readJSON(functionJsonPath));
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
     * Some projects (e.g. .NET Isolated and PyStein (i.e. Python model >=2)) don't have typical "function.json" files, so we'll have to ping localhost to get functions (only available if the project is running)
     */
    private async getChildrenForHostedProjects(context: IActionContext): Promise<AzExtTreeItem[]> {
        if (runningFuncTaskMap.has(this.parent.workspaceFolder)) {
            const hostRequest = await this.parent.getHostRequest(context);
            const functions = await requestUtils.sendRequestWithExtTimeout(context, {
                url: `${hostRequest.url}/admin/functions`,
                method: 'GET',
                rejectUnauthorized: hostRequest.rejectUnauthorized
            });
            return await this.createTreeItemsWithErrorHandling(
                <FunctionEnvelope[]>functions.parsedBody,
                'azFuncInvalidLocalFunction',
                async func => {
                    func = requestUtils.convertToAzureSdkObject(func);
                    return LocalFunctionTreeItem.create(context, this, nonNullProp(func, 'name'), new ParsedFunctionJson(func.config), undefined, func);
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

export async function getFunctionFolders(context: IActionContext, projectPath: string): Promise<string[]> {
    return await telemetryUtils.runWithDurationTelemetry(context, 'getFuncs', async () => {
        const funcJsonUris = await findFiles(projectPath, `*/${functionJsonFileName}`);
        return funcJsonUris.map(uri => path.basename(path.dirname(uri.fsPath)))
    });
}
