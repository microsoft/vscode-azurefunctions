/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, parseError } from '@microsoft/vscode-azext-utils';
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

            // Create a temporary directory for cloning
            const tempDir = path.join(ext.context.globalStorageUri.fsPath, 'tempClone', Date.now().toString());
            await AzExtFsExtra.ensureDir(tempDir);

            try {
                const branch = template.branch || 'main';

                // folderPath → sparse checkout (only that folder is downloaded; fast for monorepos)
                // subdirectory → full clone then pick the subfolder (legacy behaviour)
                // neither → full clone of the whole repo
                let sourceDir: string;

                if (template.folderPath) {
                    progress.report({ message: localize('cloningRepository', 'Cloning repository (sparse)...') });
                    await this.sparseCheckout(tempDir, template.repositoryUrl, branch, template.folderPath);

                    sourceDir = path.join(tempDir, template.folderPath);
                    if (!await AzExtFsExtra.pathExists(sourceDir)) {
                        throw new Error(localize('folderPathNotFound', 'Template folder "{0}" not found in repository', template.folderPath));
                    }
                    context.telemetry.properties.cloneMethod = 'sparse';
                } else {
                    progress.report({ message: localize('cloningRepository', 'Cloning repository...') });
                    await cpUtils.executeCommand(undefined, undefined,
                        `git clone --depth 1 --branch ${branch} "${template.repositoryUrl}" "${tempDir}"`);

                    sourceDir = tempDir;
                    if (template.subdirectory) {
                        sourceDir = path.join(tempDir, template.subdirectory);
                        if (!await AzExtFsExtra.pathExists(sourceDir)) {
                            throw new Error(localize('subdirectoryNotFound', 'Template subdirectory "{0}" not found in repository', template.subdirectory));
                        }
                    }
                    context.telemetry.properties.cloneMethod = 'full';
                }

                // Remove .git directory so it is not included in the project
                const gitDir = path.join(tempDir, '.git');
                if (await AzExtFsExtra.pathExists(gitDir)) {
                    progress.report({ message: localize('cleaningUp', 'Setting up project files...') });
                    await AzExtFsExtra.deleteResource(gitDir, { recursive: true });
                }

                // Ensure project path exists
                await AzExtFsExtra.ensureDir(projectPath);

                // Copy files to project path
                progress.report({ message: localize('copyingFiles', 'Copying template files...') });
                await this.copyDirectory(sourceDir, projectPath);

                context.clonedFromTemplate = true;
                context.telemetry.properties.cloneSuccess = 'true';
                context.telemetry.measurements.cloneDurationMs = Date.now() - startTime;

                ext.outputChannel.appendLog(localize('templateCloned', 'Successfully cloned template "{0}" to "{1}"', template.displayName, projectPath));

            } finally {
                // Clean up temp directory
                try {
                    const parentTempDir = path.join(ext.context.globalStorageUri.fsPath, 'tempClone');
                    if (await AzExtFsExtra.pathExists(parentTempDir)) {
                        await AzExtFsExtra.deleteResource(parentTempDir, { recursive: true });
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
     *   1. `git clone --depth 1 --no-checkout --filter=blob:none` — fetches commit/tree
     *      objects but no file blobs, keeping the initial download tiny.
     *   2. `git sparse-checkout init --cone` — switches to cone mode, which operates on
     *      whole directories (much faster than pattern mode).
     *   3. `git sparse-checkout set <folderPath>` — registers the target directory.
     *   4. `git checkout <branch>` — materialises only the blobs inside that directory.
     *
     * Result: `destDir/<folderPath>/` contains the template files; nothing else is present.
     */
    private async sparseCheckout(destDir: string, repoUrl: string, branch: string, folderPath: string): Promise<void> {
        // Step 1 — shallow clone without checking out any files
        await cpUtils.executeCommand(undefined, undefined,
            `git clone --depth 1 --no-checkout --filter=blob:none "${repoUrl}" "${destDir}"`);

        // Step 2 — enable cone-mode sparse checkout
        await cpUtils.executeCommand(undefined, undefined,
            `git -C "${destDir}" sparse-checkout init --cone`);

        // Step 3 — limit the working tree to the requested folder
        await cpUtils.executeCommand(undefined, undefined,
            `git -C "${destDir}" sparse-checkout set "${folderPath}"`);

        // Step 4 — materialise the blobs for that folder on the target branch
        await cpUtils.executeCommand(undefined, undefined,
            `git -C "${destDir}" checkout ${branch}`);
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
