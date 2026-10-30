/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizard, UserCancelledError, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type ProjectCreationEntryPoint } from '@microsoft/vscode-azext-webview';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    writeConnectorTriggerProjectHandoff,
    type ConnectorTriggerProjectHandoff,
} from '../../connectorTrigger/connectorTriggerProjectHandoff';
import { projectOpenBehaviorSetting } from '../../constants';
import { localize } from '../../localize';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { cpUtils } from '../../utils/cpUtils';
import { isPathEqual } from '../../utils/fs';
import { requestUtils } from '../../utils/requestUtils';
import { extractZip } from '../../utils/zipUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { type IProjectWizardContext, type OpenBehavior } from './IProjectWizardContext';
import { OpenBehaviorStep } from './OpenBehaviorStep';
import { OpenFolderStep } from './OpenFolderStep';

export interface ProjectTemplateCreatorCallbacks {
    onProjectCreated?(): void;
    onUserCancelled?(): void;
    reportProgress?(detail: string): void;
}

export interface ProjectTemplateCreationOptions {
    connectorTriggerHandoff?: ConnectorTriggerProjectHandoff;
}

export class ProjectTemplateCreator {
    public constructor(
        private readonly callbacks: ProjectTemplateCreatorCallbacks = {},
    ) { }

    public async createProject(
        actionContext: IActionContext,
        template: IProjectTemplate,
        language: string,
        projectPath: string,
        entryPoint?: ProjectCreationEntryPoint,
        options: ProjectTemplateCreationOptions = {},
    ): Promise<void> {
        actionContext.telemetry.properties.templateId = template.id;
        actionContext.telemetry.properties.templateName = template.displayName;
        actionContext.telemetry.properties.language = language;
        actionContext.telemetry.properties.entryPoint = entryPoint ?? 'unknown';

        const gitReference = this.resolveGitReference(template);
        const specificFolder = template.folderPath && template.folderPath !== '.' ?
            template.folderPath :
            undefined;
        const tempDir = path.join(os.tmpdir(), `azfunc-template-${Date.now()}`);

        await this.confirmTargetNotEmpty(actionContext, projectPath);

        try {
            const gitInstalled = await this.isGitInstalled();
            actionContext.telemetry.properties.downloadMethod = gitInstalled ? 'git' : 'zip';

            if (gitInstalled) {
                if (specificFolder) {
                    this.reportProgress('Cloning template (sparse)...');
                    await cpUtils.executeCommand(undefined, undefined,
                        'git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse',
                        '--branch', gitReference.cloneRef, template.repositoryUrl, tempDir]);
                    await cpUtils.executeCommand(undefined, tempDir,
                        'git', ['sparse-checkout', 'set', specificFolder]);

                    const sourceDir = path.join(tempDir, specificFolder);
                    if (!await AzExtFsExtra.pathExists(sourceDir)) {
                        throw new Error(`Template folder "${specificFolder}" not found in repository`);
                    }
                    this.reportProgress('Setting up project files...');
                    await AzExtFsExtra.ensureDir(projectPath);
                    await this.copyDirectory(sourceDir, projectPath);
                } else {
                    this.reportProgress('Cloning template repository...');
                    await cpUtils.executeCommand(undefined, undefined,
                        'git', ['clone', '--depth', '1', '--branch', gitReference.cloneRef, template.repositoryUrl, tempDir]);

                    let sourceDir = tempDir;
                    if (template.subdirectory) {
                        sourceDir = path.join(tempDir, template.subdirectory);
                        if (!await AzExtFsExtra.pathExists(sourceDir)) {
                            throw new Error(`Template subdirectory "${template.subdirectory}" not found in repository`);
                        }
                    }
                    this.reportProgress('Setting up project files...');
                    await AzExtFsExtra.ensureDir(projectPath);
                    await this.copyDirectory(sourceDir, projectPath);
                }
            } else {
                this.reportProgress('Downloading template (git not found, using zip)...');
                await this.downloadAndExtractZip(
                    actionContext,
                    template.repositoryUrl,
                    gitReference.archiveRef,
                    tempDir,
                );

                this.reportProgress('Setting up project files...');
                let sourceDir = tempDir;
                if (specificFolder) {
                    sourceDir = path.join(tempDir, specificFolder);
                } else if (template.subdirectory) {
                    sourceDir = path.join(tempDir, template.subdirectory);
                }
                await AzExtFsExtra.ensureDir(projectPath);
                await this.copyDirectory(sourceDir, projectPath);
            }

            this.reportProgress('Initializing git repository...');
            const gitDir = path.join(projectPath, '.git');
            try {
                if (await AzExtFsExtra.pathExists(gitDir)) {
                    await AzExtFsExtra.deleteResource(gitDir, { recursive: true });
                }
            } catch {
                // Best-effort; continue with git init anyway.
            }
            try {
                await cpUtils.executeCommandLine(undefined, projectPath, 'git init');
            } catch {
                // git init is optional.
            }

            if (options.connectorTriggerHandoff) {
                await writeConnectorTriggerProjectHandoff(
                    projectPath,
                    options.connectorTriggerHandoff,
                );
            }

            actionContext.telemetry.properties.result = 'Succeeded';
            await this.tryOpenReadme(projectPath);
            this.callbacks.onProjectCreated?.();

            void vscode.window.showInformationMessage(
                localize('projectCreated', 'Project created successfully at {0}', projectPath),
            );
            await this.promptAndOpenProject(actionContext, projectPath);
        } finally {
            try {
                await AzExtFsExtra.deleteResource(tempDir, { recursive: true });
            } catch {
                // Temporary cleanup is best-effort.
            }
        }
    }

    private reportProgress(detail: string): void {
        this.callbacks.reportProgress?.(detail);
    }

    private async confirmTargetNotEmpty(
        actionContext: IActionContext,
        projectPath: string,
    ): Promise<void> {
        if (!projectPath || !await AzExtFsExtra.pathExists(projectPath)) {
            return;
        }

        let existing: string[];
        try {
            existing = await fs.promises.readdir(projectPath);
        } catch {
            existing = [];
        }
        const ignoredNames = new Set(['Thumbs.db', 'desktop.ini', '.DS_Store']);
        const significant = existing.filter(name => !name.startsWith('.') && !ignoredNames.has(name));
        if (significant.length === 0) {
            return;
        }

        actionContext.telemetry.properties.nonEmptyTarget = 'true';
        const proceed: vscode.MessageItem = {
            title: localize('proceedAnyway', 'Create here anyway'),
        };
        try {
            await actionContext.ui.showWarningMessage(
                localize(
                    'targetNotEmpty',
                    'The selected folder "{0}" is not empty. Existing files may be overwritten. Do you want to create this template here?',
                    projectPath,
                ),
                { modal: true, stepName: 'targetNotEmpty' },
                proceed,
            );
        } catch (error) {
            if (error instanceof UserCancelledError) {
                this.callbacks.onUserCancelled?.();
            }
            throw error;
        }
    }

    private async promptAndOpenProject(
        actionContext: IActionContext,
        projectPath: string,
    ): Promise<void> {
        const alreadyOpen = (vscode.workspace.workspaceFolders ?? [])
            .some(folder => isPathEqual(folder.uri.fsPath, projectPath));
        if (alreadyOpen) {
            return;
        }

        const wizardContext = Object.assign({}, actionContext, {
            projectPath,
            workspacePath: projectPath,
            workspaceFolder: undefined,
            openBehavior: getWorkspaceSetting<OpenBehavior>(projectOpenBehaviorSetting),
        }) as Partial<IProjectWizardContext> & IActionContext;
        const wizard = new AzureWizard<IProjectWizardContext>(
            wizardContext as IProjectWizardContext,
            {
                title: localize('openProject', 'Open new project'),
                promptSteps: [new OpenBehaviorStep()],
                executeSteps: [new OpenFolderStep()],
            },
        );

        try {
            await wizard.prompt();
            await wizard.execute();
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return;
            }
            throw error;
        }
    }

    private async tryOpenReadme(projectPath: string): Promise<void> {
        const candidates = ['README.md', 'README.MD', 'Readme.md', 'readme.md'];
        for (const name of candidates) {
            const readmePath = path.join(projectPath, name);
            if (!await AzExtFsExtra.pathExists(readmePath)) {
                continue;
            }

            try {
                await vscode.commands.executeCommand(
                    'markdown.showPreview',
                    vscode.Uri.file(readmePath),
                );
            } catch {
                try {
                    await vscode.window.showTextDocument(vscode.Uri.file(readmePath), {
                        preview: false,
                        viewColumn: vscode.ViewColumn.Active,
                    });
                } catch {
                    // README opening is best-effort.
                }
            }
            return;
        }
    }

    private async isGitInstalled(): Promise<boolean> {
        try {
            await cpUtils.executeCommandLine(undefined, undefined, 'git --version');
            return true;
        } catch {
            return false;
        }
    }

    private buildZipUrl(repositoryUrl: string, archiveRef: string): string {
        const base = repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');
        return `${base}/archive/${archiveRef}.zip`;
    }

    private resolveGitReference(
        template: Pick<IProjectTemplate, 'branch' | 'gitRef'>,
    ): { archiveRef: string; cloneRef: string } {
        const explicitGitRef = template.gitRef?.trim();
        const rawRef = explicitGitRef || template.branch?.trim() || 'main';
        return {
            archiveRef: rawRef.startsWith('refs/') || explicitGitRef ?
                rawRef :
                `refs/heads/${rawRef}`,
            cloneRef: rawRef.replace(/^refs\/(?:heads|tags)\//, ''),
        };
    }

    private async downloadAndExtractZip(
        context: IActionContext,
        repositoryUrl: string,
        archiveRef: string,
        destDir: string,
    ): Promise<void> {
        const zipUrl = this.buildZipUrl(repositoryUrl, archiveRef);
        const zipPath = `${destDir}.zip`;
        const extractionDir = `${destDir}-extracted`;

        try {
            try {
                await requestUtils.downloadFile(
                    context,
                    zipUrl,
                    zipPath,
                    requestUtils.allowCrossOriginRedirectsOptions,
                );
            } catch (error) {
                throw new Error(
                    localize(
                        'zipDownloadFailed',
                        'Failed to download template zip: {0}',
                        parseError(error).message,
                    ),
                    { cause: error },
                );
            }

            await AzExtFsExtra.ensureDir(extractionDir);
            await extractZip(zipPath, extractionDir);
            const entries = await AzExtFsExtra.readDirectory(extractionDir);
            const sourceDir = entries.length === 1 &&
                entries[0].type === vscode.FileType.Directory ?
                path.join(extractionDir, entries[0].name) :
                extractionDir;
            await AzExtFsExtra.ensureDir(destDir);
            await this.copyDirectory(sourceDir, destDir);
        } finally {
            if (await AzExtFsExtra.pathExists(zipPath)) {
                await AzExtFsExtra.deleteResource(zipPath, { recursive: false });
            }
            if (await AzExtFsExtra.pathExists(extractionDir)) {
                await AzExtFsExtra.deleteResource(extractionDir, { recursive: true });
            }
        }
    }

    private async copyDirectory(source: string, destination: string): Promise<void> {
        const entries = await AzExtFsExtra.readDirectory(source);
        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const destinationPath = path.join(destination, entry.name);

            if (entry.type === vscode.FileType.Directory) {
                await AzExtFsExtra.ensureDir(destinationPath);
                await this.copyDirectory(sourcePath, destinationPath);
            } else if (entry.type === vscode.FileType.File) {
                await AzExtFsExtra.copy(sourcePath, destinationPath, { overwrite: true });
            }
        }
    }
}
