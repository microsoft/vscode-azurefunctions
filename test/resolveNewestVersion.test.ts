/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { resolveNewestVersion, type IPackageMetadata } from '../src/funcCoreTools/getNpmDistTag';

// Verify the newest core tools version we advertise matches what `npm install <pkg>@<major>` would
// actually install: npm prefers the `latest` dist-tag when it satisfies the range, otherwise the
// max satisfying version. Other dist-tags are ignored for range specs.

function createMetadata(versions: string[], distTags: { [tag: string]: string }): IPackageMetadata {
    const versionMap: { [version: string]: {} } = {};
    for (const version of versions) {
        versionMap[version] = {};
    }
    return { versions: versionMap, 'dist-tags': distTags };
}

suite('resolveNewestVersion', () => {
    test('latest wins over a higher published version', () => {
        // The exact issue #5163 case: 4.13.1 / 4.13.2 are published but `latest` is still 4.13.0
        const metadata = createMetadata(['4.12.0', '4.13.0', '4.13.1', '4.13.2'], { latest: '4.13.0' });
        assert.strictEqual(resolveNewestVersion(metadata, '4'), '4.13.0');
    });

    test('latest is ignored when it does not satisfy the requested major', () => {
        const metadata = createMetadata(['2.0.3', '2.7.3188', '4.13.0'], { latest: '4.13.0', core: '2.0.3' });
        assert.strictEqual(resolveNewestVersion(metadata, '2'), '2.7.3188');
    });

    test('falls back to max satisfying when there is no latest dist-tag', () => {
        const metadata = createMetadata(['3.0.3477', '3.0.5682', '4.13.0'], {});
        assert.strictEqual(resolveNewestVersion(metadata, '3'), '3.0.5682');
    });

    test('returns undefined when no version matches the requested major', () => {
        const metadata = createMetadata(['4.13.0', '4.13.2'], { latest: '4.13.0' });
        assert.strictEqual(resolveNewestVersion(metadata, '5'), undefined);
    });

    test('prerelease versions are not selected over stable ones', () => {
        const metadata = createMetadata(['4.13.0', '4.14.0-preview.1'], {});
        assert.strictEqual(resolveNewestVersion(metadata, '4'), '4.13.0');
    });

    test('invalid version keys and an invalid latest tag are ignored', () => {
        const metadata = createMetadata(['4.13.0', 'not-a-version'], { latest: 'not-a-version' });
        assert.strictEqual(resolveNewestVersion(metadata, '4'), '4.13.0');
    });
});
