/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as path from 'path';
import { packageJsonFileName } from "../constants";
import { ext } from '../extensionVariables';
import { cpUtils } from './cpUtils';

interface PackageJson {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

export async function installNodeDependencies(projectPath: string): Promise<void> {
    await cpUtils.executeCommand(ext.outputChannel, projectPath, 'npm', composeArgs(withArg('install'))());
}

export async function tryGetPackageJson(projectPath: string): Promise<PackageJson | undefined> {
    try {
        return await AzExtFsExtra.readJSON(path.join(projectPath, packageJsonFileName));
    } catch {
        return undefined;
    }
}

export async function hasNodeJsDependency(projectPath: string, depName: string, isDevDependency: boolean = false): Promise<boolean> {
    try {
        const packageJson = await tryGetPackageJson(projectPath);
        if (isDevDependency) {
            return !!packageJson?.devDependencies?.[depName];
        } else {
            return !!packageJson?.dependencies?.[depName];
        }
    } catch {
        return false;
    }
}
