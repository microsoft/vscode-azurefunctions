/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import { localize } from "../localize";

export interface ILinuxErrorMessages {
    /**
     * Linux message to display when no known package managers are detected to install Functions Core Tools
     */
    noPackageManager: string;
    /**
     * Linux error message to display when we fail to successfully install Functions Core Tools
     */
    failedInstall: string;
}

const linuxDistroTagKeys = ['ID', 'NAME', 'PRETTY_NAME', 'VERSION'] as const;
export type LinuxDistroTag = Partial<Record<typeof linuxDistroTagKeys[number], string>>;

// Majority of recent Linux distributions support the /etc/os-release file
async function getLinuxDistroTag(): Promise<LinuxDistroTag | undefined> {
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

export async function generateLinuxErrorMessages(hasPackageManager: boolean): Promise<ILinuxErrorMessages> {
    let noPackageManager: string = '';
    let failedInstall: string = '';
    let linuxDistroInfo: string = '';

    const linuxDistroTag: LinuxDistroTag | undefined = await getLinuxDistroTag();
    if (linuxDistroTag) {
        if (linuxDistroTag.PRETTY_NAME) {
            linuxDistroInfo += localize('linuxDistributionInfoPretty', 'Note: You are currently running "{0}".', linuxDistroTag.PRETTY_NAME);
        } else if (linuxDistroTag.NAME && linuxDistroTag.VERSION) {
            linuxDistroInfo += localize('linuxDistributionInfo', 'Note: You are currently running "{0} {1}".', linuxDistroTag.NAME, linuxDistroTag.VERSION);
        }

        if (linuxDistroInfo) {
            if (!hasPackageManager) {
                noPackageManager += ' ' + linuxDistroInfo;
            } else {
                failedInstall += ' ' + localize('failedInstallOptions', 'Try re-running the last command with "sudo" or click "Learn more" for more options.');
                failedInstall += ' ' + linuxDistroInfo;
            }
        }
    }

    return { noPackageManager, failedInstall };
}
