/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ProjectLanguage } from '../../constants';

/**
 * Represents a complete project template that can be cloned and used as a starting point
 */
export interface IProjectTemplate {
    /** Unique identifier for the template */
    id: string;

    /** User-visible name */
    displayName: string;

    /** One-line description shown in Quick Pick */
    shortDescription: string;

    /** Detailed description (markdown supported) */
    longDescription?: string;

    /** Categories for grouping templates (a template can belong to multiple) */
    categories: TemplateCategory[];

    /** Supported languages for this template */
    languages: ProjectLanguage[];

    /** Supported programming models per language (e.g., { "Python": [2], "TypeScript": [4] }) */
    languageModels?: Record<ProjectLanguage, number[]>;

    /** Git repository URL for cloning */
    repositoryUrl: string;

    /** Subdirectory within the repository if template is not at root */
    subdirectory?: string;

    /** Branch to clone from (default: main) */
    branch?: string;

    /** Required tools and dependencies */
    prerequisites: IPrerequisite[];

    /** Tags for searching and filtering */
    tags: string[];

    /** VS Code codicon name (without $() wrapper) */
    icon?: string;

    /** Sort order within category (lower = higher priority) */
    priority?: number;

    /** Show "New" badge */
    isNew?: boolean;

    /** Show "Popular" badge */
    isPopular?: boolean;

    /** Whether this template is bundled with the extension for offline use */
    offlineBundle?: boolean;

    /** Commands to run after cloning (optional) */
    postCloneCommands?: string[];

    /** Localized versions of template metadata */
    localizations?: Record<string, ITemplateLocalization>;
}

/**
 * Template manifest containing all available project templates
 */
export interface ITemplateManifest {
    /** Schema version for the manifest format */
    version: string;

    /** ISO 8601 timestamp of when the manifest was generated */
    generatedAt: string;

    /** Array of project templates */
    templates: IProjectTemplate[];
}

/**
 * Prerequisite tool or dependency required for a template
 */
export interface IPrerequisite {
    /** Unique identifier (e.g., 'func-core-tools', 'bicep', 'docker') */
    id: string;

    /** User-visible name */
    displayName: string;

    /** Command to run to detect if the tool is installed */
    detectionCommand: string;

    /** Whether this prerequisite is required (cannot skip if missing) */
    required: boolean;

    /** URL to documentation for manual installation */
    installUrl?: string;

    /** Platform-specific installation command */
    installCommand?: string;
}

/**
 * Localized template metadata
 */
export interface ITemplateLocalization {
    displayName: string;
    shortDescription: string;
    longDescription?: string;
}

/**
 * Categories for organizing templates
 */
export enum TemplateCategory {
    Starter = 'starter',
    WebAPIs = 'web-apis',
    EventProcessing = 'event-processing',
    ScheduledTasks = 'scheduled-tasks',
    AiMl = 'ai-ml',
    DataProcessing = 'data-processing',
    Workflows = 'workflows',
    Other = 'other'
}

/**
 * Result of prerequisite checking
 */
export interface IPrerequisiteCheckResult {
    /** Prerequisites that are missing */
    missing: IPrerequisite[];

    /** Prerequisites that are installed */
    installed: IPrerequisite[];

    /** Whether any required prerequisites are missing */
    hasRequiredMissing: boolean;
}
