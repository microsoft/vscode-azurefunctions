/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';

export async function getWindowsProcessTree(): Promise<IWindowsProcessTree> {
    const moduleName: string = 'windows-process-tree';
    const windowsProcessTree: IWindowsProcessTree | undefined = await import('@vscode/windows-process-tree') as unknown as IWindowsProcessTree;
    if (!windowsProcessTree) {
        throw new Error(localize('noWindowsProcessTree', 'Failed to find dependency "{0}".', moduleName));
    }
    return windowsProcessTree as IWindowsProcessTree;
}

// https://github.com/microsoft/vscode-windows-process-tree/blob/b7efc9fb4567d552ef95c7449058b6f634a82df8/typings/windows-process-tree.d.ts

export enum ProcessDataFlag {
    None = 0,
    Memory = 1,
    CommandLine = 2
}

export interface IProcessInfo {
    pid: number;
    ppid: number;
    name: string;

    /**
     * The working set size of the process, in bytes.
     */
    memory?: number;

    /**
     * The string returned is at most 512 chars, strings exceeding this length are truncated.
     */
    commandLine?: string;
}

export interface IWindowsProcessTree {
    /**
     * Returns a list of processes containing the rootPid process and all of its descendants.
     * @param rootPid - The pid of the process of interest.
     * @param callback - The callback to use with the returned set of processes.
     * @param flags - The flags for what process data should be included.
     */
    getProcessList(rootPid: number, callback: (processList: IProcessInfo[]) => void, flags?: ProcessDataFlag): void;
}
