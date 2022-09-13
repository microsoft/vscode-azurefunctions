/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../localize';
import { cpUtils } from "../../../utils/cpUtils";

import * as path from 'path';

export async function getJavaVersion(): Promise<number> {
    const javaHome: string | undefined = process.env['JAVA_HOME'];
    let javaVersion = javaHome ? await checkVersionInReleaseFile(javaHome) : undefined;
    if (!javaVersion) {
        javaVersion = await checkVersionByCLI(javaHome ? path.join(javaHome, 'bin', 'java') : 'java');
    }
    if (!javaVersion) {
        const message: string = localize('javaNotFound', 'Failed to get Java version. Please ensure that Java is installed and JAVA_HOME environment variable is set.');
        throw new Error(message);
    }
    return javaVersion;
}

async function checkVersionInReleaseFile(javaHome: string): Promise<number | undefined> {
    if (!javaHome) {
        return undefined;
    }
    const releaseFile = path.join(javaHome, "release");
    if (!await AzExtFsExtra.pathExists(releaseFile)) {
        return undefined;
    }

    try {
        const content = await AzExtFsExtra.readFile(releaseFile);
        const regexp = /^JAVA_VERSION="(.*)"/gm;
        const match = regexp.exec(content.toString());
        return match ? flattenMajorVersion(match[1]) : undefined;
    } catch (error) {
        // ignore
        return undefined;
    }
}

async function checkVersionByCLI(javaExec: string): Promise<number | undefined> {
    if (!javaExec) {
        return undefined;
    }
    const result: cpUtils.ICommandResult = await cpUtils.tryExecuteCommand(undefined, undefined, javaExec, '-version');
    const output: string = result.cmdOutputIncludingStderr;
    const regexp = /version "(.*)"/g;
    const match = regexp.exec(output);
    return match ? flattenMajorVersion(match[1]) : undefined;
}

function flattenMajorVersion(version: string): number {
    // Ignore '1.' prefix for legacy Java versions
    if (version.startsWith("1.")) {
        version = version.substring(2);
    }

    const regexp = /\d+/g;
    const match = regexp.exec(version);
    let javaVersion = 0;
    if (match) {
        javaVersion = parseInt(match[0], 10);
    }

    return javaVersion;
}
