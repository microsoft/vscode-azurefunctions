/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import request = require('request-promise');
import * as semver from 'semver';
import { ProjectRuntime } from '../constants';
import { localize } from '../localize';

const npmRegistryUri: string = 'https://aka.ms/AA2qmnu';

export interface INpmDistTag { tag: string; value: string; }

interface IPackageMetadata {
    versions: { [version: string]: {} };
}

export async function getNpmDistTag(runtime: ProjectRuntime): Promise<INpmDistTag> {
    const packageMetadata: IPackageMetadata = <IPackageMetadata>JSON.parse(await <Thenable<string>>request(npmRegistryUri));
    let majorVersion: string;
    switch (runtime) {
        case ProjectRuntime.v1:
            majorVersion = '1';
            break;
        case ProjectRuntime.v2:
            majorVersion = '2';
            break;
        default:
            throw new RangeError(localize('invalidRuntime', 'Invalid runtime "{0}".', runtime));
    }

    const validVersions: string[] = Object.keys(packageMetadata.versions).filter((v: string) => !!semver.valid(v));
    const maxVersion: string | null = semver.maxSatisfying(validVersions, majorVersion);
    if (!maxVersion) {
        throw new Error(localize('noDistTag', 'Failed to retrieve NPM tag for runtime "{0}".', runtime));
    }
    return { tag: majorVersion, value: maxVersion };
}
