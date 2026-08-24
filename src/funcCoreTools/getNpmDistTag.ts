/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import { getMajorVersion, type FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { requestUtils } from '../utils/requestUtils';

const npmRegistryUri: string = 'https://aka.ms/AA2qmnu';

export interface INpmDistTag {
    /**
     * Misnomer: this is the semver range we install with (i.e. the major version, such as "4"),
     * not an npm dist-tag. It's passed to `npm install -g azure-functions-core-tools@<tag>`.
     */
    tag: string;
    value: string;
}

export interface IPackageMetadata {
    versions: { [version: string]: {} };
    // eslint-disable-next-line @typescript-eslint/naming-convention -- matches the npm packument's actual key
    'dist-tags': { [tag: string]: string };
}

/**
 * Mirrors the precedence npm's `pick-manifest` uses when resolving a _range_ spec like `@4`:
 * the `latest` dist-tag wins if it satisfies the range, otherwise the max satisfying version is used.
 * Any other dist-tag (`core`, `v3`, etc.) is ignored for range specs.
 *
 * Resolving any other way lets the extension advertise a version that `npm install <pkg>@<major>`
 * will never actually install, producing a permanent un-clearable "update available" notification
 * (e.g. the registry publishes 4.13.2 but `dist-tags.latest` is 4.13.0, so `@4` installs 4.13.0).
 */
export function resolveNewestVersion(packageMetadata: IPackageMetadata, majorVersion: string): string | undefined {
    const latest: string | undefined = packageMetadata['dist-tags']?.latest;
    if (latest && semver.valid(latest) && semver.satisfies(latest, majorVersion)) {
        return latest;
    }

    const validVersions: string[] = Object.keys(packageMetadata.versions ?? {}).filter((v: string) => !!semver.valid(v));
    return semver.maxSatisfying(validVersions, majorVersion) ?? undefined;
}

export async function getNpmDistTag(context: IActionContext, version: FuncVersion): Promise<INpmDistTag> {
    const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: npmRegistryUri }, requestUtils.allowCrossOriginRedirectsOptions);
    const packageMetadata: IPackageMetadata = <IPackageMetadata>response.parsedBody;
    const majorVersion: string = getMajorVersion(version);

    const maxVersion: string | undefined = resolveNewestVersion(packageMetadata, majorVersion);
    if (!maxVersion) {
        throw new Error(localize('noDistTag', 'Failed to retrieve NPM tag for version "{0}".', version));
    }
    return { tag: majorVersion, value: maxVersion };
}
