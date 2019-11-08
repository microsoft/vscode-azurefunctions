/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName, PackageManager } from '../constants';
import { FuncVersion } from '../FuncVersion';
import { cpUtils } from '../utils/cpUtils';
import { getBrewPackageName } from './getBrewPackageName';

export async function getFuncPackageManagers(isFuncInstalled: boolean): Promise<PackageManager[]> {
    const result: PackageManager[] = [];
    switch (process.platform) {
        case 'linux':
            // https://github.com/Microsoft/vscode-azurefunctions/issues/311
            break;
        case 'darwin':
            if (await hasBrew(isFuncInstalled)) {
                result.push(PackageManager.brew);
            }
        // fall through to check npm on both mac and windows
        default:
            try {
                isFuncInstalled ?
                    await cpUtils.executeCommand(undefined, undefined, 'npm', 'ls', '-g', funcPackageName) :
                    await cpUtils.executeCommand(undefined, undefined, 'npm', '--version');
                result.push(PackageManager.npm);
            } catch (error) {
                // an error indicates no npm
            }
    }
    return result;
}

async function hasBrew(isFuncInstalled: boolean): Promise<boolean> {
    for (const version of Object.values(FuncVersion)) {
        if (version !== FuncVersion.v1) {
            const brewPackageName: string = getBrewPackageName(version);
            try {
                isFuncInstalled ?
                    await cpUtils.executeCommand(undefined, undefined, 'brew', 'ls', brewPackageName) :
                    await cpUtils.executeCommand(undefined, undefined, 'brew', '--version');
                return true;
            } catch (error) {
                // an error indicates no brew
            }
        }
    }

    return false;
}
