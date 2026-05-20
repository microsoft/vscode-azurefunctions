/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { feedMirror } from '../src/utils/feedMirror';

suite('feedMirror', () => {
    const testFeedBaseUrl = 'https://devdiv.pkgs.visualstudio.com/DevDiv/_packaging/azcode';
    const testFeedToken = 'test-token-123';

    let originalFeedBaseUrl: string | undefined;
    let originalFeedToken: string | undefined;

    setup(() => {
        originalFeedBaseUrl = process.env.FEED_BASE_URL;
        originalFeedToken = process.env.FEED_TOKEN;
    });

    teardown(() => {
        if (originalFeedBaseUrl !== undefined) {
            process.env.FEED_BASE_URL = originalFeedBaseUrl;
        } else {
            delete process.env.FEED_BASE_URL;
        }
        if (originalFeedToken !== undefined) {
            process.env.FEED_TOKEN = originalFeedToken;
        } else {
            delete process.env.FEED_TOKEN;
        }
    });

    suite('isEnabled', () => {
        test('returns false when env vars are not set', () => {
            delete process.env.FEED_BASE_URL;
            delete process.env.FEED_TOKEN;
            assert.strictEqual(feedMirror.isEnabled(), false);
        });

        test('returns false when only FEED_BASE_URL is set', () => {
            process.env.FEED_BASE_URL = testFeedBaseUrl;
            delete process.env.FEED_TOKEN;
            assert.strictEqual(feedMirror.isEnabled(), false);
        });

        test('returns false when only FEED_TOKEN is set', () => {
            delete process.env.FEED_BASE_URL;
            process.env.FEED_TOKEN = testFeedToken;
            assert.strictEqual(feedMirror.isEnabled(), false);
        });

        test('returns true when both env vars are set', () => {
            process.env.FEED_BASE_URL = testFeedBaseUrl;
            process.env.FEED_TOKEN = testFeedToken;
            assert.strictEqual(feedMirror.isEnabled(), true);
        });
    });

    suite('resolveUrl - disabled', () => {
        setup(() => {
            delete process.env.FEED_BASE_URL;
            delete process.env.FEED_TOKEN;
        });

        test('returns URL unchanged when feed mirror is not enabled', () => {
            const url = 'https://aka.ms/AA2qmnu';
            assert.strictEqual(feedMirror.resolveUrl(url), url);
        });
    });

    suite('resolveUrl - enabled', () => {
        setup(() => {
            process.env.FEED_BASE_URL = testFeedBaseUrl;
            process.env.FEED_TOKEN = testFeedToken;
        });

        test('rewrites NPM registry aka.ms URL', () => {
            const url = 'https://aka.ms/AA2qmnu';
            assert.strictEqual(
                feedMirror.resolveUrl(url),
                `${testFeedBaseUrl}/npm/registry/azure-functions-core-tools`
            );
        });

        test('rewrites NPM registry.npmjs.org URL', () => {
            const url = 'https://registry.npmjs.org/azure-functions-core-tools';
            assert.strictEqual(
                feedMirror.resolveUrl(url),
                `${testFeedBaseUrl}/npm/registry/azure-functions-core-tools`
            );
        });

        test('rewrites NuGet .nupkg URL from functionscdn.azureedge.net', () => {
            const url = 'https://functionscdn.azureedge.net/public/content/templates/microsoft.azure.webjobs.itemtemplates.4.0.5862.nupkg';
            assert.strictEqual(
                feedMirror.resolveUrl(url),
                `${testFeedBaseUrl}/nuget/v3/flat2/microsoft.azure.webjobs.itemtemplates/4.0.5862/microsoft.azure.webjobs.itemtemplates.4.0.5862.nupkg`
            );
        });

        test('rewrites NuGet .nupkg URL from azureedge.net', () => {
            const url = 'https://someother.azureedge.net/path/Microsoft.Azure.WebJobs.ProjectTemplates.4.0.5862.nupkg';
            assert.strictEqual(
                feedMirror.resolveUrl(url),
                `${testFeedBaseUrl}/nuget/v3/flat2/microsoft.azure.webjobs.projecttemplates/4.0.5862/microsoft.azure.webjobs.projecttemplates.4.0.5862.nupkg`
            );
        });

        test('rewrites PowerShell Gallery aka.ms URL', () => {
            const url = "https://aka.ms/PwshPackageInfo?id='Az'";
            assert.strictEqual(
                feedMirror.resolveUrl(url),
                `${testFeedBaseUrl}/powershell/`
            );
        });

        test('rewrites powershellgallery.com URL', () => {
            const url = 'https://www.powershellgallery.com/api/v2/package/Az';
            assert.strictEqual(
                feedMirror.resolveUrl(url),
                `${testFeedBaseUrl}/powershell/`
            );
        });

        test('does NOT rewrite cdn.functions.azure.com URLs', () => {
            const url = 'https://cdn.functions.azure.com/public/ExtensionBundles/Microsoft.Azure.Functions.ExtensionBundle/4.0.0/StaticContent/v2/templates/templates.json';
            assert.strictEqual(feedMirror.resolveUrl(url), url);
        });

        test('does NOT rewrite aka.ms/funcCliFeedV4', () => {
            const url = 'https://aka.ms/funcCliFeedV4';
            assert.strictEqual(feedMirror.resolveUrl(url), url);
        });

        test('does NOT rewrite aka.ms/azFuncBundleVersions', () => {
            const url = 'https://aka.ms/azFuncBundleVersions';
            assert.strictEqual(feedMirror.resolveUrl(url), url);
        });

        test('does NOT rewrite aka.ms/funcStaticProperties', () => {
            const url = 'https://aka.ms/funcStaticProperties';
            assert.strictEqual(feedMirror.resolveUrl(url), url);
        });

        test('does NOT rewrite unrecognized URLs', () => {
            const url = 'https://example.com/some/random/endpoint';
            assert.strictEqual(feedMirror.resolveUrl(url), url);
        });

        test('falls back to generic NuGet path if .nupkg filename cannot be parsed', () => {
            const url = 'https://functionscdn.azureedge.net/public/content/templates/oddformat.nupkg';
            assert.strictEqual(
                feedMirror.resolveUrl(url),
                `${testFeedBaseUrl}/nuget/v3/flat2/`
            );
        });
    });

    suite('getAuthHeaders', () => {
        test('returns empty object when FEED_TOKEN is not set', () => {
            delete process.env.FEED_TOKEN;
            const headers = feedMirror.getAuthHeaders();
            assert.deepStrictEqual(headers, {});
        });

        test('returns Bearer token when FEED_TOKEN is set', () => {
            process.env.FEED_TOKEN = testFeedToken;
            const headers = feedMirror.getAuthHeaders();
            assert.deepStrictEqual(headers, { Authorization: `Bearer ${testFeedToken}` });
        });
    });
});
