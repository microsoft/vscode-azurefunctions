/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem, GenericTreeItem, IActionContext, InvalidTreeItem } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ThemeIcon } from 'vscode';
import { functionJsonFileName } from '../../constants';
import { localize } from '../../localize';
import { telemetryUtils } from '../../utils/telemetryUtils';
import { findFiles } from '../../utils/workspace';
import { listLocalFunctions } from '../../workspace/listLocalFunctions';
import { FunctionsTreeItemBase } from '../FunctionsTreeItemBase';
import { LocalFunctionTreeItem } from './LocalFunctionTreeItem';
import { LocalProjectTreeItem } from './LocalProjectTreeItem';

export class ProjectNotRunningError extends Error {
}

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
        try {
            const localFunctionsResult = await listLocalFunctions(this.parent.project);

            const children: AzExtTreeItem[] = [];
            for (const localFunction of localFunctionsResult.functions) {
                children.push(await LocalFunctionTreeItem.create(context, this, localFunction));
            }

            for (const invalidLocalFunction of localFunctionsResult.invalidFunctions) {
                children.push(new InvalidTreeItem(this, invalidLocalFunction.error, {
                    label: invalidLocalFunction.name,
                    contextValue: 'azFuncInvalidLocalFunction'
                }))
            }

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
        } catch (error: unknown) {
            if (error instanceof ProjectNotRunningError) {
                const ti: GenericTreeItem = new GenericTreeItem(this, {
                    label: localize('startDebugging', 'Start debugging to update this list...'),
                    iconPath: new ThemeIcon('info'),
                    commandId: 'workbench.action.debug.start',
                    contextValue: 'startDebugging'
                });
                // By default `GenericTreeItem` will pass itself as the args, but VS Code doesn't seem to like that so pass empty array
                ti.commandArgs = [];
                return [ti];
            } else {
                throw error;
            }
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

}

export async function getFunctionFolders(context: IActionContext, projectPath: string): Promise<string[]> {
    return await telemetryUtils.runWithDurationTelemetry(context, 'getFuncs', async () => {
        const funcJsonUris = await findFiles(projectPath, `*/${functionJsonFileName}`);
        return funcJsonUris.map(uri => path.basename(path.dirname(uri.fsPath)))
    });
}
