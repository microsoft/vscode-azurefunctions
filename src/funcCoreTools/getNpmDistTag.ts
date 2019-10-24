/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { FuncVersion, getMajorVersion } from '../FuncVersion';
import { localize } from '../localize';
import { requestUtils } from '../utils/requestUtils';

const npmRegistryUri: string = 'https://aka.ms/AA2qmnu';

export interface INpmDistTag { tag: string; value: string; }

interface IPackageMetadata {
    versions: { [version: string]: {} };
}

export async function getNpmDistTag(version: FuncVersion): Promise<INpmDistTag> {
    const request: requestUtils.Request = await requestUtils.getDefaultRequest(npmRegistryUri);
    const response: string = await requestUtils.sendRequest(request);
    const packageMetadata: IPackageMetadata = <IPackageMetadata>JSON.parse(response);
    const majorVersion: string = getMajorVersion(version);

    const validVersions: string[] = Object.keys(packageMetadata.versions).filter((v: string) => !!semver.valid(v));
    const maxVersion: string | null = semver.maxSatisfying(validVersions, majorVersion);
    if (!maxVersion) {
        throw new Error(localize('noDistTag', 'Failed to retrieve NPM tag for version "{0}".', version));
    }
    return { tag: majorVersion, value: maxVersion };
}
