/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName, PackageManager, Platform } from '../constants';
import { cpUtils } from '../utils/cpUtils';

export async function getFuncPackageManager(isFuncInstalled: boolean): Promise<PackageManager | undefined> {
    switch (process.platform) {
        case Platform.Linux:
            // https://github.com/Microsoft/vscode-azurefunctions/issues/311
            return undefined;
        case Platform.MacOS:
            try {
                isFuncInstalled ?
                    await cpUtils.executeCommand(undefined, undefined, 'brew', 'ls', funcPackageName) :
                    await cpUtils.executeCommand(undefined, undefined, 'brew', '--version');
                return PackageManager.brew;
            } catch (error) {
                // an error indicates no brew; continue to default, npm case
            }
        default:
            try {
                isFuncInstalled ?
                    await cpUtils.executeCommand(undefined, undefined, 'npm', 'ls', '-g', funcPackageName) :
                    await cpUtils.executeCommand(undefined, undefined, 'npm', '--version');
                return PackageManager.npm;
            } catch (error) {
                return undefined;
            }
    }
}
