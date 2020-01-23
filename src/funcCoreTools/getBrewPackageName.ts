/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName } from '../constants';
import { FuncVersion, getMajorVersion } from '../FuncVersion';
import { cpUtils } from '../utils/cpUtils';

export function getBrewPackageName(version: FuncVersion): string {
    return `${funcPackageName}@${getMajorVersion(version)}`;
}

export async function tryGetInstalledBrewPackageName(version: FuncVersion): Promise<string | undefined> {
    const brewPackageName: string = getBrewPackageName(version);
    if (await isBrewPackageInstalled(brewPackageName)) {
        return brewPackageName;
    } else {
        let oldPackageName: string | undefined;
        if (version === FuncVersion.v2) {
            oldPackageName = funcPackageName;
        } else if (version === FuncVersion.v3) {
            oldPackageName = funcPackageName + '-v3-preview';
        }

        if (oldPackageName && await isBrewPackageInstalled(oldPackageName)) {
            return oldPackageName;
        } else {
            return undefined;
        }
    }
}

async function isBrewPackageInstalled(packageName: string): Promise<boolean> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'brew', 'ls', packageName);
        return true;
    } catch (error) {
        return false;
    }
}
