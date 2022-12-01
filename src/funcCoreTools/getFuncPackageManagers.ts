/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName, PackageManager } from '../constants';
import { FuncVersion } from '../FuncVersion';
import { cpUtils } from '../utils/cpUtils';
import { tryGetInstalledBrewPackageName } from './getBrewPackageName';

export async function getFuncPackageManagers(isFuncInstalled: boolean): Promise<PackageManager[]> {
    const result: PackageManager[] = [];

    if (process.platform === 'darwin' && await hasBrew(isFuncInstalled)) {
        result.push(PackageManager.brew);
    }

    // Always check for npm (mac, windows, linux)
    try {
        isFuncInstalled ?
            await cpUtils.executeCommand(undefined, undefined, 'npm', 'ls', '-g', funcPackageName) :
            await cpUtils.executeCommand(undefined, undefined, 'npm', '--version');
        result.push(PackageManager.npm);
    } catch (error) {
        // an error indicates no npm
    }

    return result;
}

async function hasBrew(isFuncInstalled: boolean): Promise<boolean> {
    for (const version of Object.values(FuncVersion)) {
        if (version !== FuncVersion.v1) {
            if (isFuncInstalled) {
                const packageName: string | undefined = await tryGetInstalledBrewPackageName(version);
                if (packageName) {
                    return true;
                }
            } else {
                try {
                    await cpUtils.executeCommand(undefined, undefined, 'brew', '--version');
                    return true;
                } catch (error) {
                    // an error indicates no brew
                }
            }
        }
    }

    return false;
}
