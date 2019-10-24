/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName } from '../constants';
import { FuncVersion, getMajorVersion, isPreviewVersion } from '../FuncVersion';

export function getBrewPackageName(version: FuncVersion): string {
    let result: string = funcPackageName;
    if (version !== FuncVersion.v2) { // v2 was the original version supported for brew and doesn't have the version in the name
        const majorVersion: string = getMajorVersion(version);
        result += '-v' + majorVersion;
    }

    if (isPreviewVersion(version)) {
        result += '-preview';
    }

    return result;
}
