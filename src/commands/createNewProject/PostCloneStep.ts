/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { commands, FileType, type Progress, window } from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { type IProjectWizardContext } from './IProjectWizardContext';

/**
 * Execute step that handles post-clone actions like Bicep detection
 */
export class PostCloneStep extends AzureWizardExecuteStep<IProjectWizardContext> {
    public priority: number = 20; // Run after CloneTemplateStep

    public async execute(context: IProjectWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const projectPath = nonNullProp(context, 'projectPath');

        progress.report({ message: localize('analyzingProject', 'Analyzing project...') });

        // Check for Bicep files
        context.hasBicepFiles = await this.detectBicepFiles(projectPath);
        context.telemetry.properties.hasBicepFiles = String(context.hasBicepFiles);

        // Show Bicep notification if enabled and files found
        if (context.hasBicepFiles) {
            const showBicepPrompt = getWorkspaceSetting<boolean>('projectTemplates.showBicepPrompt') ?? true;

            if (showBicepPrompt) {
                // Don't await - show notification after wizard completes
                this.showBicepNotification(projectPath);
            }
        }

        // Check for README and queue welcome notification
        const hasReadme = await this.detectReadme(projectPath);
        context.telemetry.properties.hasReadme = String(hasReadme);

        if (hasReadme && context.selectedTemplate) {
            // Don't await - show notification after wizard completes
            this.showWelcomeNotification(context.selectedTemplate.displayName, projectPath);
        }
    }

    public shouldExecute(context: IProjectWizardContext): boolean {
        return context.clonedFromTemplate === true;
    }

    /**
     * Check if the project contains .bicep files
     */
    private async detectBicepFiles(projectPath: string): Promise<boolean> {
        // Check common locations for Bicep files
        const bicepLocations = [
            path.join(projectPath, 'infra'),
            path.join(projectPath, 'infrastructure'),
            path.join(projectPath, 'deploy'),
            projectPath
        ];

        for (const location of bicepLocations) {
            if (await AzExtFsExtra.pathExists(location)) {
                const hasBicep = await this.containsBicepFiles(location);
                if (hasBicep) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if a directory contains .bicep files
     */
    private async containsBicepFiles(dirPath: string): Promise<boolean> {
        try {
            const entries = await AzExtFsExtra.readDirectory(dirPath);

            for (const entry of entries) {
                if (entry.type === FileType.File && entry.name.endsWith('.bicep')) {
                    return true;
                }
            }
        } catch {
            // Ignore errors
        }
        return false;
    }

    /**
     * Check if the project contains a README.md file
     */
    private async detectReadme(projectPath: string): Promise<boolean> {
        const readmePaths = [
            path.join(projectPath, 'README.md'),
            path.join(projectPath, 'readme.md'),
            path.join(projectPath, 'Readme.md')
        ];

        for (const readmePath of readmePaths) {
            if (await AzExtFsExtra.pathExists(readmePath)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Show notification about Bicep infrastructure files
     */
    private showBicepNotification(projectPath: string): void {
        const message = localize('bicepDetected', 'This template includes infrastructure-as-code (Bicep) files.');

        const deployInfra = localize('deployInfrastructure', 'Deploy Infrastructure');
        const viewFiles = localize('viewBicepFiles', 'View Bicep Files');
        const skip = localize('skipForNow', 'Skip for Now');

        // Use setImmediate to show notification after wizard completes
        setImmediate(() => {
            void window.showInformationMessage(message, deployInfra, viewFiles, skip).then(async (selection) => {
                if (selection === deployInfra) {
                    // Try to run Azure Developer CLI (azd) deployment or open terminal
                    ext.outputChannel.appendLog(localize('deployingInfra', 'Opening terminal for infrastructure deployment...'));
                    await commands.executeCommand('workbench.action.terminal.new');
                    // The user can run 'azd up' or 'az deployment' commands
                } else if (selection === viewFiles) {
                    // Open infra folder in explorer
                    const infraPath = path.join(projectPath, 'infra');
                    if (await AzExtFsExtra.pathExists(infraPath)) {
                        await commands.executeCommand('revealInExplorer', infraPath);
                    } else {
                        // Just reveal the project root
                        await commands.executeCommand('revealInExplorer', projectPath);
                    }
                }
                // 'Skip for Now' - do nothing
            });
        });
    }

    /**
     * Show welcome notification with template name
     */
    private showWelcomeNotification(templateName: string, projectPath: string): void {
        const message = localize('welcomeToTemplate', 'Welcome to {0}!', templateName);

        const openReadme = localize('openReadme', 'Open README');
        const startDebugging = localize('startDebugging', 'Start Debugging (F5)');

        // Use setImmediate to show notification after wizard completes
        setImmediate(() => {
            void window.showInformationMessage(message, openReadme, startDebugging).then(async (selection) => {
                if (selection === openReadme) {
                    // Open README.md
                    const readmePath = path.join(projectPath, 'README.md');
                    if (await AzExtFsExtra.pathExists(readmePath)) {
                        await commands.executeCommand('vscode.open', readmePath);
                    }
                } else if (selection === startDebugging) {
                    // Start debugging
                    await commands.executeCommand('workbench.action.debug.start');
                }
            });
        });
    }
}
