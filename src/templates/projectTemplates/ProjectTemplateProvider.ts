/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage, projectTemplatesCacheExpirationHoursSetting } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { requestUtils } from '../../utils/requestUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { TemplateCategory, type IProjectTemplate, type ITemplateManifest } from './IProjectTemplate';

/**
 * Provides project templates from a remote manifest with caching and offline fallback
 */
export class ProjectTemplateProvider {
    private static readonly CACHE_KEY = 'projectTemplatesManifest';
    private static readonly CACHE_TIMESTAMP_KEY = 'projectTemplatesManifestTimestamp';
    private static readonly MANIFEST_URL = 'https://cdn.functions.azure.com/public/templates-manifest/manifest.json';
    private static readonly DEFAULT_CACHE_EXPIRATION_HOURS = 24;

    /**
     * Get all project templates, applying language and model filtering
     */
    public async getTemplates(context: IActionContext, language?: ProjectLanguage, languageModel?: number): Promise<IProjectTemplate[]> {
        const manifest = await this.getManifest(context);
        // Normalize manifest field names so the rest of the code works against a
        // consistent shape regardless of which manifest version was fetched.
        let templates = manifest.templates.map(t => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw = t as any;

            // categories: accept singular 'category' string from older manifests
            const categories: TemplateCategory[] =
                raw.categories?.length ? raw.categories
                    : raw.category ? [raw.category as TemplateCategory]
                        : [];

            // displayName: accept 'name' or 'title' as fallbacks
            const displayName: string = raw.displayName ?? raw.name ?? raw.title ?? '';

            // shortDescription: accept 'description' or 'summary' as fallbacks
            const shortDescription: string =
                raw.shortDescription ?? raw.description ?? raw.summary ?? '';

            // repositoryUrl: accept 'repoUrl', 'repo', or 'repository' as fallbacks
            const repositoryUrl: string =
                raw.repositoryUrl ?? raw.repoUrl ?? raw.repo ?? raw.repository ?? '';

            // languages: new manifest uses singular 'language' string; older manifests
            // and our interface use a 'languages' array. Remap and normalise the value
            // so it matches the ProjectLanguage enum (e.g. "CSharp" → "C#").
            const languages: ProjectLanguage[] =
                raw.languages?.length ? raw.languages
                    : raw.language ? [normalizeLanguage(raw.language as string)]
                        : [];

            // folderPath: canonical new field — no alias needed
            const folderPath: string | undefined = raw.folderPath;

            // subdirectory: legacy field kept for backward compatibility
            const subdirectory: string | undefined = raw.subdirectory;

            return {
                ...t,
                categories,
                displayName,
                shortDescription,
                repositoryUrl,
                languages,
                ...(folderPath !== undefined ? { folderPath } : {}),
                ...(subdirectory !== undefined ? { subdirectory } : {}),
            } as IProjectTemplate;
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
        const expirationHours = getWorkspaceSetting<number>(projectTemplatesCacheExpirationHoursSetting) || ProjectTemplateProvider.DEFAULT_CACHE_EXPIRATION_HOURS;
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
     * Fetch manifest from the Microsoft-hosted CDN
     */
    private async fetchManifestFromRemote(context: IActionContext): Promise<ITemplateManifest> {
        ext.outputChannel.appendLog(localize('fetchingFromUrl', 'Fetching manifest from: {0}', ProjectTemplateProvider.MANIFEST_URL));
        return await this.fetchManifestFromUrl(context, ProjectTemplateProvider.MANIFEST_URL);
    }

    /**
     * Fetch manifest from a specific URL using the extension's request utilities
     */
    private async fetchManifestFromUrl(context: IActionContext, url: string): Promise<ITemplateManifest> {
        const response = await requestUtils.sendRequestWithExtTimeout(context, { url, method: 'GET' });

        if (response.status < 200 || response.status >= 300) {
            throw new Error(localize('httpError', 'HTTP error {0}', response.status.toString()));
        }

        const text = response.bodyAsText ?? '';
        const manifest = JSON.parse(text) as ITemplateManifest;

        // Validate manifest structure
        if (!manifest.version || !manifest.templates || !Array.isArray(manifest.templates)) {
            throw new Error(localize('invalidManifestFormat', 'Invalid manifest format'));
        }

        return manifest;
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

/**
 * Map manifest language strings to ProjectLanguage enum values.
 * The new manifest uses names like "CSharp" while the enum uses "C#".
 * Unknown values are passed through as-is so they can still be displayed.
 */
function normalizeLanguage(language: string): ProjectLanguage {
    const map: Record<string, ProjectLanguage> = {
        'CSharp': ProjectLanguage.CSharp,
        'FSharp': ProjectLanguage.FSharp,
        'Java': ProjectLanguage.Java,
        'JavaScript': ProjectLanguage.JavaScript,
        'PowerShell': ProjectLanguage.PowerShell,
        'Python': ProjectLanguage.Python,
        'TypeScript': ProjectLanguage.TypeScript,
        'Ballerina': ProjectLanguage.Ballerina,
        'Custom': ProjectLanguage.Custom,
    };
    return map[language] ?? language as ProjectLanguage;
}
