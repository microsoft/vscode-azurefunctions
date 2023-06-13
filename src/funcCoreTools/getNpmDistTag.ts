/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import { FuncVersion, getMajorVersion } from '../FuncVersion';
import { localize } from '../localize';
import { requestUtils } from '../utils/requestUtils';

const npmRegistryUri: string = 'https://aka.ms/AA2qmnu';

export interface INpmDistTag { tag: string; value: string; }

interface IPackageMetadata {
    versions: { [version: string]: {} };
}

export async function getNpmDistTag(context: IActionContext, version: FuncVersion): Promise<INpmDistTag> {
    const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: npmRegistryUri });
    const packageMetadata: IPackageMetadata = <IPackageMetadata>response.parsedBody;
    const majorVersion: string = getMajorVersion(version);

    const validVersions: string[] = Object.keys(packageMetadata.versions).filter((v: string) => !!semver.valid(v));
    const maxVersion: string | null = semver.maxSatisfying(validVersions, majorVersion);
    if (!maxVersion) {
        throw new Error(localize('noDistTag', 'Failed to retrieve NPM tag for version "{0}".', version));
    }
    return { tag: majorVersion, value: maxVersion };
}
