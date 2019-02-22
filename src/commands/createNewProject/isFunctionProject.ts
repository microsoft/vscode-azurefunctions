/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { hostFileName } from '../../constants';

// Use 'host.json' as an indicator that this is a functions project
export async function isFunctionProject(folderPath: string): Promise<boolean> {
    return await fse.pathExists(path.join(folderPath, hostFileName));
}

/**
 * Checks root folder and subFolders one level down
 * If a single function project is found, returns that path
 */
export async function tryGetFunctionProjectRoot(folderPath: string): Promise<string | undefined> {
    if (await isFunctionProject(folderPath)) {
        return folderPath;
    } else {
        const subpaths: string[] = await fse.readdir(folderPath);
        const matchingSubpaths: string[] = [];
        await Promise.all(subpaths.map(async (subpath: string) => {
            if (await isFunctionProject(path.join(folderPath, subpath))) {
                matchingSubpaths.push(subpath);
            }
        }));
        return matchingSubpaths.length === 1 ? path.join(folderPath, matchingSubpaths[0]) : undefined;
    }
}
