/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { localize } from '../localize';

export namespace nugetUtils {
    const wildcard: string = '*';

    export function tryGetMaxInRange(rangeString: string, versions: string[]): string | undefined {
        let finalRange: string = wildcard;
        const range: IVersionRange | string = parseVersionRange(rangeString);
        if (typeof range === 'string') {
            finalRange = range;
        } else {
            const minVersion: string | undefined = range.minVersion;
            if (minVersion) {
                if (minVersion.includes(wildcard)) {
                    if (range.includeMinVersion) {
                        versions = versions.filter(v => semver.satisfies(v, minVersion) || semver.gtr(v, minVersion));
                    } else {
                        versions = versions.filter(v => semver.gtr(v, minVersion));
                    }
                } else if (range.includeMinVersion) {
                    versions = versions.filter(v => semver.gte(v, minVersion));
                } else {
                    versions = versions.filter(v => semver.gt(v, minVersion));
                }
            }

            const maxVersion: string | undefined = range.maxVersion;
            if (maxVersion) {
                if (range.includeMaxVersion) {
                    versions = versions.filter(v => semver.lte(v, maxVersion));
                } else {
                    versions = versions.filter(v => semver.lt(v, maxVersion));
                }
            }
        }

        return semver.maxSatisfying(versions, finalRange);
    }

    interface IVersionRange {
        minVersion: string;
        includeMinVersion: boolean;
        maxVersion: string | undefined;
        includeMaxVersion: boolean | undefined;
    }

    // Adapted from: https://github.com/NuGetArchive/NuGet.Versioning/blob/master/src/NuGet.Versioning/VersionRangeFactory.cs#L81
    // More docs here: https://docs.microsoft.com/nuget/concepts/package-versioning
    function parseVersionRange(value: string): IVersionRange | string {
        const error: Error = new Error(localize('invalidRange', 'Invalid range "{0}"', value));

        value = value.trim();

        // * is the only range below 3 chars
        if (value === wildcard) {
            return value;
        }

        // Fail early if the string is too short to be valid
        if (value.length < 3) {
            throw error;
        }

        let includeMinVersion: boolean;
        let minVersion: string | undefined;
        let includeMaxVersion: boolean | undefined;
        let maxVersion: string | undefined;

        if (value[0] === '(' || value[0] === '[') {
            // The first character must be [ or (
            switch (value[0]) {
                case '[':
                    includeMinVersion = true;
                    break;
                case '(':
                    includeMinVersion = false;
                    break;
                default:
                    throw error;
            }

            // The last character must be ] or )
            switch (value[value.length - 1]) {
                case ']':
                    includeMaxVersion = true;
                    break;
                case ')':
                    includeMaxVersion = false;
                    break;
                default:
                    throw error;
            }

            // Get rid of the two brackets
            value = value.substring(1, value.length - 1);

            // Split by comma, and make sure we get between 1 and 2 non-empty parts
            const parts: string[] = value.split(',').map(p => p.trim());
            if (parts.length > 2 || !parts.some(p => !!p)) {
                throw error;
            }

            // If there is only one part, use it for both min and max
            minVersion = parts[0];
            maxVersion = parts.length === 2 ? parts[1] : parts[0];
        } else {
            if (value.includes(wildcard)) { // If the value has wildcards, it denotes a range
                return value;
            } else { // Otherwise, it denotes the minimum version (inclusive)
                includeMinVersion = true;
                minVersion = value;
            }
        }

        if (minVersion) {
            if (minVersion.includes(wildcard)) {
                if (!semver.validRange(minVersion)) {
                    throw error;
                }
            } else {
                minVersion = appendMissingParts(minVersion);
                if (!semver.valid(minVersion)) {
                    throw error;
                }
            }
        }

        if (maxVersion) {
            // max does not support wildcards
            maxVersion = appendMissingParts(maxVersion);
            if (!semver.valid(maxVersion)) {
                throw error;
            }
        }

        return {
            minVersion,
            includeMinVersion,
            maxVersion,
            includeMaxVersion
        };
    }

    /**
     * Appends ".0" until we have major, minor, and patch
     */
    function appendMissingParts(version: string): string {
        if (/[^0-9.]/.test(version)) {
            // Assume wildcard or prerelease versions are fine as-is
            return version;
        } else {
            let count: number = (version.match(/\./g) || []).length;
            while (count < 2) {
                version += '.0';
                count += 1;
            }
            return version;
        }
    }
}
