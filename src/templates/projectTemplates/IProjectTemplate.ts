/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ProjectLanguage } from '../../constants';

/**
 * Subset of the project template manifest schema that this extension reads or
 * produces. Additional descriptive fields (icon, tags, priority, longDescription,
 * isNew, isHighlighted, resource, etc.) flow through to the webview unchanged
 * via the shared `IProjectTemplate` type from `@microsoft/vscode-azext-webview`,
 * so they are not duplicated here.
 */
export interface IProjectTemplate {
    /** Unique identifier for the template (used for telemetry). */
    id: string;

    /** User-visible name. */
    displayName: string;

    /** One-line description. */
    shortDescription: string;

    /** Categories for grouping templates (a template can belong to multiple). */
    categories: TemplateCategory[];

    /** Supported languages for this template. */
    languages: ProjectLanguage[];

    /** Supported programming models per language (e.g., { "Python": [2], "TypeScript": [4] }). */
    languageModels?: Record<ProjectLanguage, number[]>;

    /** Git repository URL for cloning. */
    repositoryUrl: string;

    /** Branch to clone from (default: main). */
    branch?: string;

    /**
     * Folder path within the repository to use as the project root.
     * When set, a git sparse-checkout is performed so only this folder is downloaded.
     * Takes precedence over `subdirectory` when both are present.
     */
    folderPath?: string;

    /**
     * Subdirectory within the repository if template is not at root (legacy).
     * Prefer `folderPath` for new manifests — `subdirectory` triggers a full clone
     * followed by a directory copy, whereas `folderPath` uses sparse-checkout.
     */
    subdirectory?: string;
}

/**
 * Template manifest containing all available project templates.
 */
export interface ITemplateManifest {
    /** Schema version for the manifest format. */
    version: string;

    /** ISO 8601 timestamp of when the manifest was generated. */
    generatedAt: string;

    /** Array of project templates. */
    templates: IProjectTemplate[];
}

/**
 * Categories for organizing templates. Values match the manifest schema.
 */
export enum TemplateCategory {
    Starter = 'starter',
    WebAPIs = 'web-apis',
    EventProcessing = 'event-processing',
    ScheduledTasks = 'scheduling',
    AiMl = 'ai-ml',
    DataProcessing = 'data-processing',
    Workflows = 'workflows',
    Other = 'other'
}

