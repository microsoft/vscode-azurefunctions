/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type ProjectLanguage } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { TemplateCategory, type IProjectTemplate, type ITemplateManifest } from './IProjectTemplate';

/**
 * Provides project templates from a remote manifest with caching and offline fallback
 */
export class ProjectTemplateProvider {
    private static readonly CACHE_KEY = 'projectTemplatesManifest';
    private static readonly CACHE_TIMESTAMP_KEY = 'projectTemplatesManifestTimestamp';
    private static readonly DEFAULT_MANIFEST_URL = 'https://manifest-h5bkgrbdfzh4hma3.b01.azurefd.net/templates/manifest.json?sp=r&st=2026-02-13T19:00:49Z&se=2026-09-04T02:15:49Z&spr=https&sv=2024-11-04&sr=c&sig=YCuWH4OWVA36PVQNTz0xjXuRNhfzZWFPlEwWvcAL7MQ%3D';
    private static readonly DEFAULT_CACHE_EXPIRATION_HOURS = 24;

    /**
     * Get all project templates, applying language and model filtering
     */
    public async getTemplates(context: IActionContext, language?: ProjectLanguage, languageModel?: number): Promise<IProjectTemplate[]> {
        const manifest = await this.getManifest(context);
        // Normalize: ensure every template has a proper 'categories' array.
        // Handles old manifests that use the singular "category" string field.
        let templates = manifest.templates.map(t => {
            const raw = t as unknown as { category?: string; categories?: TemplateCategory[] };
            if (raw.categories?.length) {
                return t;
            }
            const legacy = raw.category;
            return { ...t, categories: legacy ? [legacy as TemplateCategory] : [] };
        });

        // Filter by language if specified
        if (language) {
            templates = templates.filter(t => t.languages.includes(language));

            // Further filter by language model if specified
            if (languageModel !== undefined && templates.some(t => t.languageModels)) {
                templates = templates.filter(t => {
                    if (!t.languageModels || !t.languageModels[language]) {
                        // If template doesn't specify models, it supports all
                        return true;
                    }
                    return t.languageModels[language].includes(languageModel);
                });
            }
        }

        return templates;
    }

    /**
     * Get the template manifest, using cache or fetching from remote
     */
    public async getManifest(context: IActionContext): Promise<ITemplateManifest> {
        // Try to get cached manifest if not expired
        const cachedManifest = await this.getCachedManifest();
        if (cachedManifest) {
            context.telemetry.properties.manifestSource = 'cache';
            ext.outputChannel.appendLog(localize('usingCachedManifest', 'Using cached template manifest ({0} templates)', cachedManifest.templates.length.toString()));
            return cachedManifest;
        }

        // Try to fetch from remote
        try {
            ext.outputChannel.appendLog('DEBUG: About to fetch from remote - v2');
            const manifest = await this.fetchManifestFromRemote(context);
            await this.cacheManifest(manifest);
            context.telemetry.properties.manifestSource = 'remote';
            ext.outputChannel.appendLog(localize('manifestFetched', 'Successfully fetched template manifest ({0} templates)', manifest.templates.length.toString()));
            return manifest;
        } catch (error) {
            // If remote fetch fails, try bundled fallback
            context.telemetry.properties.manifestSource = 'bundled';
            context.telemetry.properties.manifestFetchError = parseError(error).message;

            ext.outputChannel.appendLog(localize('manifestFetchFailed', 'Could not fetch template manifest from remote: {0}. Using bundled templates.', parseError(error).message));

            return await this.getBundledManifest();
        }
    }

    /**
     * Clear the cached manifest, forcing a fresh fetch on next request
     */
    public async clearCache(): Promise<void> {
        ext.outputChannel.appendLog(localize('clearingCache', 'Clearing template manifest cache...'));
        await ext.context.globalState.update(ProjectTemplateProvider.CACHE_KEY, undefined);
        await ext.context.globalState.update(ProjectTemplateProvider.CACHE_TIMESTAMP_KEY, undefined);
    }

    /**
     * Get cached manifest if it exists and hasn't expired
     */
    private async getCachedManifest(): Promise<ITemplateManifest | undefined> {
        const cached = ext.context.globalState.get<ITemplateManifest>(ProjectTemplateProvider.CACHE_KEY);
        const cachedTimestamp = ext.context.globalState.get<number>(ProjectTemplateProvider.CACHE_TIMESTAMP_KEY);

        if (!cached || !cachedTimestamp) {
            return undefined;
        }

        // Check if cache has expired
        const expirationHours = getWorkspaceSetting<number>('projectTemplates.cacheExpirationHours') || ProjectTemplateProvider.DEFAULT_CACHE_EXPIRATION_HOURS;
        const expirationMs = expirationHours * 60 * 60 * 1000;
        const now = Date.now();

        if (now - cachedTimestamp > expirationMs) {
            return undefined;
        }

        return cached;
    }

    /**
     * Cache the manifest with current timestamp
     */
    private async cacheManifest(manifest: ITemplateManifest): Promise<void> {
        await ext.context.globalState.update(ProjectTemplateProvider.CACHE_KEY, manifest);
        await ext.context.globalState.update(ProjectTemplateProvider.CACHE_TIMESTAMP_KEY, Date.now());
    }

    /**
     * Fetch manifest from remote URL(s)
     */
    private async fetchManifestFromRemote(context: IActionContext): Promise<ITemplateManifest> {
        const primaryUrl = ProjectTemplateProvider.DEFAULT_MANIFEST_URL;
        const additionalUrls = getWorkspaceSetting<string[]>('projectTemplates.additionalManifestUrls') || [];

        ext.outputChannel.appendLog(localize('fetchingFromUrl', 'Fetching manifest from: {0}', primaryUrl));

        // Fetch primary manifest
        const primaryManifest = await this.fetchManifestFromUrl(context, primaryUrl);

        // If there are no additional URLs, return the primary manifest
        if (additionalUrls.length === 0) {
            return primaryManifest;
        }

        // Fetch and merge additional manifests
        const allTemplates = [...primaryManifest.templates];

        for (const url of additionalUrls) {
            try {
                const additionalManifest = await this.fetchManifestFromUrl(context, url);
                allTemplates.push(...additionalManifest.templates);
            } catch (error) {
                // Log error but continue with other manifests
                ext.outputChannel.appendLog(localize('additionalManifestFailed', 'Could not fetch additional template manifest from {0}: {1}', url, parseError(error).message));
            }
        }

        return {
            version: primaryManifest.version,
            generatedAt: primaryManifest.generatedAt,
            templates: allTemplates
        };
    }

    /**
     * Fetch manifest from a specific URL using native fetch
     */
    private async fetchManifestFromUrl(_context: IActionContext, url: string): Promise<ITemplateManifest> {
        ext.outputChannel.appendLog(`Fetching from: ${url.substring(0, 80)}...`);

        const timeoutMs = (getWorkspaceSetting<number>('requestTimeout') || 15) * 1000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'VSCode-AzureFunctions'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            ext.outputChannel.appendLog(`Response status: ${response.status}`);

            if (!response.ok) {
                throw new Error(localize('httpError', 'HTTP error {0}', response.status.toString()));
            }

            const text = await response.text();
            ext.outputChannel.appendLog(`Response length: ${text.length}`);

            // Log first 500 chars if not JSON
            if (!text.trim().startsWith('{')) {
                ext.outputChannel.appendLog(`Unexpected response (first 500 chars): ${text.substring(0, 500)}`);
            }

            const manifest = JSON.parse(text) as ITemplateManifest;

            // Validate manifest structure
            if (!manifest.version || !manifest.templates || !Array.isArray(manifest.templates)) {
                throw new Error(localize('invalidManifestFormat', 'Invalid manifest format'));
            }

            return manifest;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(localize('requestTimeout', 'Request timed out'));
            }
            throw error;
        }
    }

    /**
     * Get bundled fallback manifest
     */
    private async getBundledManifest(): Promise<ITemplateManifest> {
        const bundledPath = path.join(ext.context.extensionPath, 'resources', 'backupProjectTemplates', 'manifest.json');

        if (!await AzExtFsExtra.pathExists(bundledPath)) {
            throw new Error(localize('noBundledManifest', 'No bundled template manifest found and remote fetch failed'));
        }

        const manifestContent = await AzExtFsExtra.readFile(bundledPath);
        return JSON.parse(manifestContent) as ITemplateManifest;
    }
}
