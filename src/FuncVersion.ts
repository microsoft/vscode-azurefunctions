/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureQuickPickItem, IAzureQuickPickOptions } from 'vscode-azureextensionui';
import { localize } from './localize';
import { openUrl } from './utils/openUrl';

export enum FuncVersion {
    v1 = '~1',
    v2 = '~2',
    v3 = '~3'
}

export const latestGAVersion: FuncVersion = FuncVersion.v3;

export async function promptForFuncVersion(context: IActionContext, message?: string): Promise<FuncVersion> {
    const recommended: string = localize('recommended', '(Recommended)');
    let picks: IAzureQuickPickItem<FuncVersion | undefined>[] = [
        { label: 'Azure Functions v3', description: recommended, data: FuncVersion.v3 },
        { label: 'Azure Functions v2', data: FuncVersion.v2 },
        { label: 'Azure Functions v1', data: FuncVersion.v1 }
    ];

    picks = picks.filter(p => osSupportsVersion(p.data));

    picks.push({ label: localize('learnMore', '$(link-external) Learn more...'), description: '', data: undefined });

    const options: IAzureQuickPickOptions = { placeHolder: message || localize('selectVersion', 'Select a version'), suppressPersistence: true };
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const version: FuncVersion | undefined = (await context.ui.showQuickPick(picks, options)).data;
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

export function isPreviewVersion(_version: FuncVersion): boolean {
    return false;
}

function osSupportsVersion(version: FuncVersion | undefined): boolean {
    return version !== FuncVersion.v1 || process.platform === 'win32';
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
