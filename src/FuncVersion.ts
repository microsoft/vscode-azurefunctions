/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureQuickPickItem, IAzureQuickPickOptions } from 'vscode-azureextensionui';
import { isWindows } from './constants';
import { ext } from './extensionVariables';
import { localize } from './localize';
import { openUrl } from './utils/openUrl';

export enum FuncVersion {
    v1 = '~1',
    v2 = '~2',
    v3 = '~3'
}

export const latestGAVersion: FuncVersion = FuncVersion.v2;

export async function promptForFuncVersion(message?: string): Promise<FuncVersion> {
    const picks: IAzureQuickPickItem<FuncVersion | undefined>[] = [];

    picks.push({ label: 'Azure Functions v2', description: '(.NET Core)', data: FuncVersion.v2 });
    picks.push({ label: 'Azure Functions v3 Preview', description: '(.NET Core)', data: FuncVersion.v3 });

    if (isWindows) {
        picks.push({ label: 'Azure Functions v1', description: '(.NET Framework)', data: FuncVersion.v1 });
    }

    picks.push({ label: localize('learnMore', 'Learn more...'), description: '', data: undefined });

    const options: IAzureQuickPickOptions = { placeHolder: message || localize('selectVersion', 'Select a version'), suppressPersistence: true };
    // tslint:disable-next-line: no-constant-condition
    while (true) {
        const version: FuncVersion | undefined = (await ext.ui.showQuickPick(picks, options)).data;
        if (version === undefined) {
            await openUrl('https://aka.ms/AA1tpij');
        } else {
            return version;
        }
    }
}

export function tryParseFuncVersion(data: string | undefined): FuncVersion | undefined {
    if (data) {
        const majorVersion: string | undefined = tryGetMajorVersion(data);
        if (majorVersion) {
            return Object.values(FuncVersion).find(v => v === '~' + majorVersion);
        }
    }

    return undefined;
}

export function isPreviewVersion(version: FuncVersion): boolean {
    return version === FuncVersion.v3;
}

export function getMajorVersion(data: string): string {
    const majorVersion: string | undefined = tryGetMajorVersion(data);
    if (!majorVersion) {
        throw new Error(localize('invalidVersion', 'Invalid version "{0}".', data));
    }
    return majorVersion;
}

function tryGetMajorVersion(data: string): string | undefined {
    const match: RegExpMatchArray | null = data.match(/^[~v]?([0-9]+)/i);
    return match ? match[1] : undefined;
}
