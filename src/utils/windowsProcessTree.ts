/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';
import { getCoreNodeModule } from "./getCoreNodeModule";

export function getWindowsProcessTree(): IWindowsProcessTree {
    const moduleName: string = 'windows-process-tree';
    // tslint:disable-next-line:no-unsafe-any
    const windowsProcessTree: IWindowsProcessTree | undefined = getCoreNodeModule<IWindowsProcessTree>(moduleName);
    if (!windowsProcessTree) {
        throw new Error(localize('noWindowsProcessTree', 'Failed to find dependency "{0}".', moduleName));
    }
    return windowsProcessTree;
}

export interface IWindowsProcessTree {
    getProcessTree(rootPid: number, callback: (tree: IProcessTreeNode | undefined) => void): void;
}

export interface IProcessTreeNode {
    pid: number;
    name: string;
    memory?: number;
    commandLine?: string;
    children: IProcessTreeNode[];
}
