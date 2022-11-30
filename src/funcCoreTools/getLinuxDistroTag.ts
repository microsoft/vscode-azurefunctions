/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";

const linuxDistroTagKeys: ['ID', 'NAME', 'PRETTY_NAME', 'VERSION'] = ['ID', 'NAME', 'PRETTY_NAME', 'VERSION'];

export type LinuxDistroTag = Partial<Record<typeof linuxDistroTagKeys[number], string>>;

// Majority of recent Linux distributions support the /etc/os-release file
// https://gist.github.com/natefoo/814c5bf936922dad97ff
export async function getLinuxDistroTag(): Promise<LinuxDistroTag | undefined> {
    const commonReleasePath: string = '/etc/os-release';
    if (!await AzExtFsExtra.pathExists(commonReleasePath)) {
        return undefined;
    }

    const linuxDistroTag: LinuxDistroTag = {};
    const releaseContents: string = await AzExtFsExtra.readFile(commonReleasePath);
    const lines: string[] = releaseContents.split('\n');
    for (const line of lines) {
        const [key, value] = line.split('=');
        if (key in linuxDistroTagKeys) {
            linuxDistroTag[key] = value;
        }
    }

    return linuxDistroTag;
}
