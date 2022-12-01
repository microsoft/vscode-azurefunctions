/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";

const linuxDistroTagKeys = ['ID', 'NAME', 'PRETTY_NAME', 'VERSION'] as const;

export type LinuxDistroTag = Partial<Record<typeof linuxDistroTagKeys[number], string>>;

// Majority of recent Linux distributions support the /etc/os-release file
export async function getLinuxDistroTag(): Promise<LinuxDistroTag | undefined> {
    const osReleasePath: string = '/etc/os-release';
    if (!await AzExtFsExtra.pathExists(osReleasePath)) {
        return undefined;
    }

    const linuxDistroTag: LinuxDistroTag = {};
    const releaseContents: string = await AzExtFsExtra.readFile(osReleasePath);
    const lines: string[] = releaseContents.split('\n');

    for (const line of lines) {
        const [key, value] = line.split('=');
        if (linuxDistroTagKeys.includes(key as typeof linuxDistroTagKeys[number])) {
            linuxDistroTag[key] = value.replace(/['"]+/g, '');
        }
    }

    return linuxDistroTag;
}
