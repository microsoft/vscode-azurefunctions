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
     * URL prefixes and patterns that should be rewritten to the feed mirror.
     * NOTE: We do NOT rewrite cdn.functions.azure.com, aka.ms/funcCliFeedV4,
     * aka.ms/azFuncBundleVersions, or aka.ms/funcStaticProperties.
     */

    function getFeedBaseUrl(): string | undefined {
        return process.env.FEED_BASE_URL;
    }

    function getFeedToken(): string | undefined {
        return process.env.FEED_TOKEN;
    }

    /**
     * Returns true if the feed mirror environment variables are configured.
     */
    export function isEnabled(): boolean {
        return !!getFeedBaseUrl() && !!getFeedToken();
    }

    /**
     * Rewrites a known external URL to the internal feed mirror URL.
     * If the feed mirror is not enabled or the URL is not recognized, returns the original URL.
     */
    export function resolveUrl(url: string): string {
        const feedBaseUrl = getFeedBaseUrl();
        if (!feedBaseUrl || !getFeedToken()) {
            return url;
        }

        // NPM registry: aka.ms/AA2qmnu or registry.npmjs.org
        if (url === 'https://aka.ms/AA2qmnu' || url.includes('registry.npmjs.org')) {
            return `${feedBaseUrl}/npm/registry/azure-functions-core-tools`;
        }

        // NuGet .nupkg downloads: functionscdn.azureedge.net or azureedge.net
        if (url.includes('functionscdn.azureedge.net') || (url.includes('azureedge.net') && url.includes('.nupkg'))) {
            // Extract the package name and version from the URL to construct the NuGet flat container path
            const nupkgMatch = url.match(/\/([^/]+)\.(\d+\.\d+\.\d+[^/]*)\.nupkg/i);
            if (nupkgMatch) {
                const packageId = nupkgMatch[1].toLowerCase();
                const version = nupkgMatch[2].toLowerCase();
                return `${feedBaseUrl}/nuget/v3/flat2/${packageId}/${version}/${packageId}.${version}.nupkg`;
            }
            return `${feedBaseUrl}/nuget/v3/flat2/`;
        }

        // PowerShell Gallery: aka.ms/PwshPackageInfo or powershellgallery.com
        if (url.includes('aka.ms/PwshPackageInfo') || url.includes('powershellgallery.com')) {
            return `${feedBaseUrl}/powershell/`;
        }

        return url;
    }

    /**
     * Returns the auth headers needed when the URL has been rewritten to the feed mirror.
     * Call this after resolveUrl and only if the URL was changed.
     */
    export function getAuthHeaders(): Record<string, string> {
        const token = getFeedToken();
        if (token) {
            return { Authorization: `Bearer ${token}` };
        }
        return {};
    }
}
