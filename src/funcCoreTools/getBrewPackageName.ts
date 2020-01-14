/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName } from '../constants';
import { FuncVersion, getMajorVersion } from '../FuncVersion';

export function getBrewPackageName(version: FuncVersion): string {
    return `${funcPackageName}@${getMajorVersion(version)}`;
}
