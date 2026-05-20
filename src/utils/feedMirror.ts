/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Utility module for routing external HTTP calls through an internal Azure Artifacts
 * caching feed mirror during CI tests. Active only when both FEED_BASE_URL and FEED_TOKEN
 * environment variables are set.
 */

export namespace feedMirror {
    /**
     * Rewrites a known external URL to the internal feed mirror URL.
     * If the feed mirror is not enabled or the URL is not recognized, returns the original URL.
     */
    export function resolveUrl(url: string): string {
        const feedBaseUrl = process.env.FEED_BASE_URL;
        if (!feedBaseUrl || !process.env.FEED_TOKEN) {
            return url;
        }

        // NPM registry: exact aka.ms/AA2qmnu URL or registry.npmjs.org hostname
        if (url === 'https://aka.ms/AA2qmnu') {
            return `${feedBaseUrl}/npm/registry/azure-functions-core-tools`;
        }

        let hostname: string;
        try {
            hostname = new URL(url).hostname;
        } catch {
            return url;
        }

        if (hostname === 'registry.npmjs.org') {
            return `${feedBaseUrl}/npm/registry/azure-functions-core-tools`;
        }

        // NuGet .nupkg downloads: functionscdn.azureedge.net hostname or other azureedge.net subdomains with .nupkg
        if (hostname === 'functionscdn.azureedge.net' || (hostname.endsWith('.azureedge.net') && url.endsWith('.nupkg'))) {
            // Extract the package name and version from the URL to construct the NuGet flat container path
            // Supports versions like 4.0.5862, 1.0.0-beta, 1.0.0.1, 1.0.0-preview.1
            const nupkgMatch = url.match(/\/([^/]+?)\.(\d+\.\d+\.\d+(?:\.\d+)?(?:-[^/]*)?)\.nupkg/i);
            if (nupkgMatch) {
                const packageId = nupkgMatch[1].toLowerCase();
                const version = nupkgMatch[2].toLowerCase();
                return `${feedBaseUrl}/nuget/v3/flat2/${packageId}/${version}/${packageId}.${version}.nupkg`;
            }
            return `${feedBaseUrl}/nuget/v3/flat2/`;
        }

        // PowerShell Gallery: exact aka.ms/PwshPackageInfo path or powershellgallery.com hostname
        if (hostname === 'aka.ms' && url.includes('aka.ms/PwshPackageInfo')) {
            return `${feedBaseUrl}/powershell/`;
        }

        if (hostname === 'www.powershellgallery.com' || hostname === 'powershellgallery.com') {
            return `${feedBaseUrl}/powershell/`;
        }

        return url;
    }

    /**
     * Returns the auth headers needed when the URL has been rewritten to the feed mirror.
     * Call this after resolveUrl and only if the URL was changed.
     */
    export function getAuthHeaders(): Record<string, string> {
        const token = process.env.FEED_TOKEN;
        if (token) {
            return { Authorization: `Bearer ${token}` };
        }
        return {};
    }
}
