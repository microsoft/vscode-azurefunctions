/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, parseError } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import * as path from 'path';
import { FileType, type Progress } from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { cpUtils } from '../../utils/cpUtils';
import { nonNullProp } from '../../utils/nonNull';
import { type IProjectWizardContext } from './IProjectWizardContext';

/**
 * Execute step that clones a project template from a git repository
 */
export class CloneTemplateStep extends AzureWizardExecuteStep<IProjectWizardContext> {
    public priority: number = 10; // Run early, before other project setup steps

    public async execute(context: IProjectWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const template = nonNullProp(context, 'selectedTemplate');
        const projectPath = nonNullProp(context, 'projectPath');

        const startTime = Date.now();
        context.telemetry.properties.cloneTemplateId = template.id;

        try {
            progress.report({ message: localize('cloningTemplate', 'Cloning template: {0}...', template.displayName) });

            const branch = template.branch || 'main';
            // folderPath of "." means the whole repo root — treat as full clone
            const specificFolder = template.folderPath && template.folderPath !== '.' ? template.folderPath : undefined;

            // Always clone into a unique os.tmpdir() folder — never conflicts with a pre-existing projectPath
            const tempDir = path.join(os.tmpdir(), `azfunc-template-${Date.now()}`);

            try {
                if (specificFolder) {
                    // Sparse checkout — only download the target subfolder
                    progress.report({ message: localize('cloningRepository', 'Cloning repository (sparse)...') });
                    await this.sparseCheckout(tempDir, template.repositoryUrl, branch, specificFolder);

                    const sourceDir = path.join(tempDir, specificFolder);
                    if (!await AzExtFsExtra.pathExists(sourceDir)) {
                        throw new Error(localize('folderPathNotFound', 'Template folder "{0}" not found in repository', specificFolder));
                    }
                    context.telemetry.properties.cloneMethod = 'sparse';

                    progress.report({ message: localize('copyingFiles', 'Copying template files...') });
                    await AzExtFsExtra.ensureDir(projectPath);
                    await this.copyDirectory(sourceDir, projectPath);
                } else {
                    // Full clone into temp, then copy to projectPath
                    progress.report({ message: localize('cloningRepository', 'Cloning repository...') });
                    await cpUtils.executeCommand(undefined, undefined,
                        'git', 'clone', '--depth', '1', '--branch', branch, template.repositoryUrl, tempDir);

                    let sourceDir = tempDir;
                    if (template.subdirectory) {
                        sourceDir = path.join(tempDir, template.subdirectory);
                        if (!await AzExtFsExtra.pathExists(sourceDir)) {
                            throw new Error(localize('subdirectoryNotFound', 'Template subdirectory "{0}" not found in repository', template.subdirectory));
                        }
                    }
                    context.telemetry.properties.cloneMethod = 'full';

                    progress.report({ message: localize('copyingFiles', 'Copying template files...') });
                    await AzExtFsExtra.ensureDir(projectPath);
                    await this.copyDirectory(sourceDir, projectPath);
                }

                context.clonedFromTemplate = true;
                context.telemetry.properties.cloneSuccess = 'true';
                context.telemetry.measurements.cloneDurationMs = Date.now() - startTime;

                ext.outputChannel.appendLog(localize('templateCloned', 'Successfully cloned template "{0}" to "{1}"', template.displayName, projectPath));

            } finally {
                try {
                    if (await AzExtFsExtra.pathExists(tempDir)) {
                        await AzExtFsExtra.deleteResource(tempDir, { recursive: true });
                    }
                } catch {
                    // Ignore cleanup errors
                }
            }

        } catch (error) {
            context.telemetry.properties.cloneSuccess = 'false';
            context.telemetry.properties.cloneError = parseError(error).message;
            context.telemetry.measurements.cloneDurationMs = Date.now() - startTime;

            const errorMessage = parseError(error).message;

            // Provide user-friendly error messages
            if (errorMessage.includes('Authentication') || errorMessage.includes('auth')) {
                throw new Error(localize('cloneFailedAuth', 'Failed to clone template: Authentication required. This template may be from a private repository.'));
            } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
                throw new Error(localize('cloneFailedNotFound', 'Failed to clone template: Repository not found. The template may have been moved or deleted.'));
            } else if (errorMessage.includes('network') || errorMessage.includes('unable to access')) {
                throw new Error(localize('cloneFailedNetwork', 'Failed to clone template: Network error. Check your internet connection and try again.'));
            } else {
                throw new Error(localize('cloneFailedGeneric', 'Failed to clone template: {0}', errorMessage));
            }
        }
    }

    public shouldExecute(context: IProjectWizardContext): boolean {
        return context.startingPoint === 'template' && context.selectedTemplate !== undefined && !context.clonedFromTemplate;
    }

    /**
     * Clone only a specific folder from a repository using git sparse-checkout.
     *
     * Strategy:
     *   1. `git clone --depth 1 --filter=blob:none --sparse --branch <branch>` — fetches
     *      commit/tree objects but no file blobs, and initialises cone-mode sparse checkout
     *      with only root-level files checked out.
     *   2. `git sparse-checkout set <folderPath>` — switches the cone to the target folder
     *      and triggers on-demand blob download for that folder only.
     *
     * Result: `destDir/<folderPath>/` contains the template files; nothing else is present.
     */
    private async sparseCheckout(destDir: string, repoUrl: string, branch: string, folderPath: string): Promise<void> {
        // Step 1 — shallow clone with sparse checkout wired up at clone time
        await cpUtils.executeCommand(undefined, undefined,
            'git', 'clone', '--depth', '1', '--filter=blob:none', '--sparse',
            '--branch', branch, repoUrl, destDir);

        // Step 2 — narrow the cone to the requested folder; blobs are fetched on demand
        await cpUtils.executeCommand(undefined, destDir,
            'git', 'sparse-checkout', 'set', folderPath);
    }

    /**
     * Recursively copy a directory's contents
     */
    private async copyDirectory(source: string, destination: string): Promise<void> {
        const entries = await AzExtFsExtra.readDirectory(source);

        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const destPath = path.join(destination, entry.name);

            if (entry.type === FileType.Directory) {
                await AzExtFsExtra.ensureDir(destPath);
                await this.copyDirectory(sourcePath, destPath);
            } else if (entry.type === FileType.File) {
                await AzExtFsExtra.copy(sourcePath, destPath, { overwrite: true });
            }
        }
    }
}
