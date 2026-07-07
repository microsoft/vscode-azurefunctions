/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizard, UserCancelledError, callWithTelemetryAndErrorHandling, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { TemplateGalleryController, registerWebviewExtensionVariables, type IProjectTemplate as ISharedProjectTemplate, type ProjectCreationEntryPoint, type TemplateGalleryConfig } from '@microsoft/vscode-azext-webview';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../templates/projectTemplates/ProjectTemplateProvider';
import { cpUtils } from '../../utils/cpUtils';
import { isPathEqual } from '../../utils/fs';
import { requestUtils } from '../../utils/requestUtils';
import { extractZip } from '../../utils/zipUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { projectOpenBehaviorSetting } from '../../constants';
import { type IProjectWizardContext, type OpenBehavior } from './IProjectWizardContext';
import { OpenBehaviorStep } from './OpenBehaviorStep';
import { OpenFolderStep } from './OpenFolderStep';

/**
 * Azure Functions implementation of the shared TemplateGalleryController.
 * The shared package owns the UI, message routing, and panel lifecycle.
 * This subclass provides functions-specific business logic (template fetching,
 * project creation, AI generation, etc.).
 */
export class FunctionsTemplateGalleryController extends TemplateGalleryController {
    public static currentController: FunctionsTemplateGalleryController | undefined;
    private static webviewVariablesRegistered = false;

    private readonly templateProvider: ProjectTemplateProvider;
    private isPanelDisposed = false;
    private readonly initialLocation: string | undefined;

    private constructor(context: vscode.ExtensionContext, config: TemplateGalleryConfig, initialLocation?: string) {
        super(context, config);
        this.templateProvider = new ProjectTemplateProvider();
        this.initialLocation = initialLocation;

        this.registerDisposable(
            this.onDisposed(() => {
                this.isPanelDisposed = true;
                FunctionsTemplateGalleryController.currentController = undefined;
            }),
        );
    }

    public static createOrShow(context: vscode.ExtensionContext, initialLocation?: string): FunctionsTemplateGalleryController {
        const existing = FunctionsTemplateGalleryController.currentController;
        if (existing) {
            // If the caller supplied a fresh initialLocation (typically from the classic
            // wizard's folder picker) and it differs from what the existing panel was
            // created with, the old defaultLocation is stale. Dispose so we recreate
            // with the new location instead of silently ignoring it.
            if (initialLocation !== undefined && (existing.initialLocation === undefined || !isPathEqual(existing.initialLocation, initialLocation))) {
                existing.dispose();
            } else {
                existing.revealToForeground();
                return existing;
            }
        }

        if (!FunctionsTemplateGalleryController.webviewVariablesRegistered) {
            registerWebviewExtensionVariables({
                context,
                webviewAssetsDir: path.join(context.extensionPath, 'dist', 'webview'),
            });
            FunctionsTemplateGalleryController.webviewVariablesRegistered = true;
        }

        const config: TemplateGalleryConfig = {
            serviceName: 'Azure Functions',
            headerTitle: localize('templateGallery', 'Template Gallery'),
            headerSubtitle: localize('templateGallerySubtitle', 'Create a new Azure Functions project from a template'),
            supportsAiGeneration: true,
            aiGeneration: {
                tabLabel: localize('buildWithCopilotChat', 'Build with Copilot Chat'),
                introDescription: localize(
                    'copilotChatIntroWithSkills',
                    'Describe the serverless agent or Azure Functions app you want to build. Azure Functions Skills will be installed into your workspace and Copilot Chat will use them to scaffold, validate, and refine the project.',
                ),
                promptPlaceholder: localize(
                    'copilotChatPromptPlaceholderWithSkills',
                    'e.g., Build a serverless agent on Azure Functions that summarizes new Microsoft blog posts every morning, stores session state, and exposes an HTTP endpoint for manual runs.',
                ),
                examplesLabel: localize('copilotChatExamplesWithSkills', 'Try a serverless agent example:'),
                examplePrompts: [
                    {
                        label: localize('serverlessAgentDailySummaryLabel', 'Daily summary agent'),
                        prompt: 'Create a serverless agent on Azure Functions that runs every morning, summarizes new Microsoft blog posts, stores session state, and sends a short digest to a configured channel. Use Azure Functions Skills and the azure-functions-agents guidance.',
                    },
                    {
                        label: localize('serverlessAgentSupportTriageLabel', 'Support triage agent'),
                        prompt: 'Create an Azure Functions serverless agent that accepts support tickets over HTTP, classifies urgency, extracts required customer context, and writes triage results to a queue for downstream handling.',
                    },
                    {
                        label: localize('serverlessAgentToolGatewayLabel', 'Agent tool gateway'),
                        prompt: 'Create an Azure Functions app that hosts agent tools for retrieving product data, updating a status record, and returning structured responses suitable for Copilot Chat.',
                    },
                    {
                        label: localize('serverlessAgentWorkflowLabel', 'Workflow agent'),
                        prompt: 'Create a durable serverless agent workflow on Azure Functions that breaks a research task into steps, runs tool calls, stores intermediate state, and returns a final report.',
                    },
                ],
                openChatButtonLabel: localize('openCopilotWithSkills', 'Install skills and open Copilot Chat'),
                chatConfirmationDescription: localize(
                    'copilotChatConfirmationWithSkills',
                    'Azure Functions Skills are being installed locally for this workspace. Copilot Chat will open with a concise prompt that routes generation through the skills, so you can review each proposed change before it is applied.',
                ),
                capabilitiesTitle: localize('copilotChatSkillsCapabilitiesTitle', 'What Azure Functions Skills add'),
                capabilitiesAriaLabel: localize('copilotChatSkillsCapabilitiesAria', 'Azure Functions Skills capabilities'),
                capabilities: [
                    localize('copilotChatSkillCapabilityCreate', 'Guided Azure Functions and serverless-agent project creation'),
                    localize('copilotChatSkillCapabilityBestPractices', 'Built-in runtime, trigger, identity, and deployment best practices'),
                    localize('copilotChatSkillCapabilityValidation', 'Local validation and diagnostics guidance before deployment'),
                    localize('copilotChatSkillCapabilityDeploy', 'Deployment handoff through Azure Skills when you are ready'),
                ],
            },
        };

        FunctionsTemplateGalleryController.currentController = new FunctionsTemplateGalleryController(context, config, initialLocation);
        return FunctionsTemplateGalleryController.currentController;
    }

    // ── Abstract method implementations ──

    protected async fetchTemplates(): Promise<{ templates: ISharedProjectTemplate[]; defaultLocation: string }> {
        return await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.getTemplates', async (actionContext: IActionContext) => {
            const templates = await this.templateProvider.getTemplates(actionContext);
            let defaultLocation = '';
            if (this.initialLocation) {
                // Prefer the folder the user already picked in the classic wizard before
                // switching into the gallery — otherwise we'd fall back to the open
                // workspace folder, which is almost always the wrong target.
                defaultLocation = this.initialLocation;
            } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                defaultLocation = vscode.workspace.workspaceFolders[0].uri.fsPath;
            }
            return { templates: templates as unknown as ISharedProjectTemplate[], defaultLocation };
        }) as { templates: ISharedProjectTemplate[]; defaultLocation: string };
    }

    protected async getReadme(template: ISharedProjectTemplate): Promise<string> {
        if (!template?.repositoryUrl) {
            ext.outputChannel.appendLog('README fetch skipped: no repositoryUrl on template');
            return '';
        }

        const base = template.repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');
        const rawBase = base.replace('https://github.com/', 'https://raw.githubusercontent.com/');
        const branch = template.branch || 'main';
        const url = `${rawBase}/${branch}/README.md`;

        ext.outputChannel.appendLog(`Fetching README: ${url}`);

        const markdown = await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.getReadme', async (actionContext: IActionContext) => {
            actionContext.errorHandling.suppressDisplay = true;
            const response = await requestUtils.sendRequestWithExtTimeout(actionContext, { url, method: 'GET' });
            ext.outputChannel.appendLog(`README response: ${response.status}`);
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.bodyAsText ?? '';
        });
        ext.outputChannel.appendLog(`README length: ${(markdown ?? '').length}`);
        return markdown ?? '';
    }

    protected async createProject(sharedTemplate: ISharedProjectTemplate, language: string, location: string, entryPoint?: ProjectCreationEntryPoint): Promise<void> {
        const template = sharedTemplate as unknown as IProjectTemplate;
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.createProject', async (actionContext: IActionContext) => {
            actionContext.telemetry.properties.templateId = template.id;
            actionContext.telemetry.properties.templateName = template.displayName;
            actionContext.telemetry.properties.language = language;
            actionContext.telemetry.properties.entryPoint = entryPoint ?? 'unknown';

            const projectPath = location;
            const branch = template.branch || 'main';
            const specificFolder = template.folderPath && template.folderPath !== '.' ? template.folderPath : undefined;
            const tempDir = path.join(os.tmpdir(), `azfunc-template-${Date.now()}`);

            // If the chosen project path already contains "real" user-visible content,
            // confirm with the user before clobbering.
            await this.confirmTargetNotEmpty(actionContext, projectPath);

            try {
                const gitInstalled = await this.isGitInstalled();
                actionContext.telemetry.properties.downloadMethod = gitInstalled ? 'git' : 'zip';

                if (gitInstalled) {
                    if (specificFolder) {
                        this.sendProgress('Cloning template (sparse)...');
                        await cpUtils.executeCommand(undefined, undefined,
                            'git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse',
                            '--branch', branch, template.repositoryUrl, tempDir]);
                        await cpUtils.executeCommand(undefined, tempDir,
                            'git', ['sparse-checkout', 'set', specificFolder]);

                        const sourceDir = path.join(tempDir, specificFolder);
                        if (!await AzExtFsExtra.pathExists(sourceDir)) {
                            throw new Error(`Template folder "${specificFolder}" not found in repository`);
                        }
                        this.sendProgress('Setting up project files...');
                        await AzExtFsExtra.ensureDir(projectPath);
                        await this.copyDirectory(sourceDir, projectPath);
                    } else {
                        this.sendProgress('Cloning template repository...');
                        await cpUtils.executeCommand(undefined, undefined,
                            'git', ['clone', '--depth', '1', '--branch', branch, template.repositoryUrl, tempDir]);

                        let sourceDir = tempDir;
                        if (template.subdirectory) {
                            sourceDir = path.join(tempDir, template.subdirectory);
                            if (!await AzExtFsExtra.pathExists(sourceDir)) {
                                throw new Error(`Template subdirectory "${template.subdirectory}" not found in repository`);
                            }
                        }
                        this.sendProgress('Setting up project files...');
                        await AzExtFsExtra.ensureDir(projectPath);
                        await this.copyDirectory(sourceDir, projectPath);
                    }
                } else {
                    this.sendProgress('Downloading template (git not found, using zip)...');
                    await this.downloadAndExtractZip(actionContext, template.repositoryUrl, branch, tempDir);

                    this.sendProgress('Setting up project files...');
                    let sourceDir = tempDir;
                    if (specificFolder) {
                        sourceDir = path.join(tempDir, specificFolder);
                    } else if (template.subdirectory) {
                        sourceDir = path.join(tempDir, template.subdirectory);
                    }
                    await AzExtFsExtra.ensureDir(projectPath);
                    await this.copyDirectory(sourceDir, projectPath);
                }

                this.sendProgress('Initializing git repository...');
                // Remove the cloned template's git history so the user gets a fresh repo
                // without the original author's commits.
                const gitDir = path.join(projectPath, '.git');
                try {
                    if (await AzExtFsExtra.pathExists(gitDir)) {
                        await AzExtFsExtra.deleteResource(gitDir, { recursive: true });
                    }
                } catch {
                    // Best-effort; continue with git init anyway
                }
                try {
                    await cpUtils.executeCommandLine(undefined, projectPath, 'git init');
                } catch {
                    // git init is optional
                }

                actionContext.telemetry.properties.result = 'Succeeded';

                // Open the README in the editor before disposing the webview so the user
                // doesn't see an empty editor pane between dispose and the project opening.
                await this.tryOpenReadme(projectPath);

                this.disposePanelIfOpen();

                void vscode.window.showInformationMessage(
                    localize('projectCreated', 'Project created successfully at {0}', projectPath),
                );

                // Match the classic wizard's post-create behavior: prompt the user how to
                // open the newly created project (Open in current/new window, or Add to
                // workspace) and then act on it via the shared OpenFolderStep. This keeps
                // both flows consistent and reuses the same telemetry / activity output.
                await this.promptAndOpenProject(actionContext, projectPath);
            } finally {
                try { await AzExtFsExtra.deleteResource(tempDir, { recursive: true }); } catch { /* ignore */ }
            }
        });
    }

    private async promptAndOpenProject(actionContext: IActionContext, projectPath: string): Promise<void> {
        // If the freshly-created project is already part of the open workspace,
        // there's nothing to open.
        const alreadyOpen = (vscode.workspace.workspaceFolders ?? []).some(f => isPathEqual(f.uri.fsPath, projectPath));
        if (alreadyOpen) {
            return;
        }

        const wizardContext = Object.assign({}, actionContext, {
            projectPath,
            workspacePath: projectPath,
            workspaceFolder: undefined,
            openBehavior: getWorkspaceSetting<OpenBehavior>(projectOpenBehaviorSetting),
        }) as Partial<IProjectWizardContext> & IActionContext;

        const wizard = new AzureWizard<IProjectWizardContext>(wizardContext as IProjectWizardContext, {
            title: localize('openProject', 'Open new project'),
            promptSteps: [new OpenBehaviorStep()],
            executeSteps: [new OpenFolderStep()],
        });

        try {
            await wizard.prompt();
            await wizard.execute();
        } catch (err) {
            if (err instanceof UserCancelledError) {
                // User dismissed the open-behavior picker — files are already on disk,
                // so just leave them in place. No need to surface an error.
                return;
            }
            throw err;
        }
    }

    // ── Optional overrides ──

    protected override async continueInChat(prompt: string, language: string, location: string): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.continueInChat', async (actionContext: IActionContext) => {
            actionContext.telemetry.properties.language = language;
            actionContext.telemetry.properties.skillsInstallTarget = location ? 'galleryLocation' : 'workspaceFallback';

            const skillsInstall = await installAzureFunctionsSkillsForCopilotChat(location);
            actionContext.telemetry.properties.skillsInstallResult = skillsInstall.result;
            actionContext.telemetry.properties.skillsInstallFilesWritten = String(skillsInstall.filesWritten ?? 0);

            const chatQuery = [
                `Please help me build an Azure Functions app.`,
                '',
                `**What I want to build:** ${prompt}`,
                '',
                `**Language:** ${language}`,
                '',
                `**Azure Functions Skills:**`,
                `- Azure Functions Skills have been installed locally in this workspace for GitHub Copilot Chat.`,
                `- Use the relevant skills first, especially azure-functions-setup, azure-functions-create, and azure-functions-agents when this is a serverless-agent scenario.`,
                `- If Azure Skills are not available for deployment, keep generation local and explain the deployment prerequisite.`,
                skillsInstall.message ? `- Install note: ${skillsInstall.message}` : undefined,
                '',
                `**Project guidance:**`,
                `- Prefer Azure Functions serverless-agent patterns when the requested app involves agents, tools, sessions, or model-backed workflows.`,
                `- Keep the prompt-to-code flow concise: ask only for missing requirements, then scaffold working files.`,
                `- Follow the selected language's current Azure Functions programming model.`,
                '',
                `**Language grounding:**`,
                languageGrounding(language),
            ].filter((line): line is string => line !== undefined).join('\n');

            try {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: chatQuery,
                    isPartialQuery: true,
                    newSession: true,
                });
                actionContext.telemetry.properties.result = 'Succeeded';
                this.postMessageToWebview({ type: 'chatOpened' });
            } catch (error) {
                actionContext.telemetry.properties.result = 'Failed';
                ext.outputChannel.appendLog(localize('chatOpenError', 'Failed to open Copilot Chat: {0}', parseError(error).message));
                this.postMessageToWebview({ type: 'chatUnavailable', message: parseError(error).message });
            }
        });
    }

    protected override async fetchCachedTemplates(): Promise<{ templates: ISharedProjectTemplate[]; defaultLocation: string } | undefined> {
        await this.templateProvider.clearCache();
        return await this.fetchTemplates();
    }

    // ── Helpers ──

    /**
     * Dispose the webview panel only if it's still open. Calling
     * `this.panel.dispose()` after the user has already closed the panel
     * throws because the underlying `WebviewPanel` has been released by VS Code.
     */
    private disposePanelIfOpen(): void {
        if (this.isPanelDisposed) {
            return;
        }
        try {
            this.panel.dispose();
        } catch {
            // Panel was already disposed between the flag check and the call;
            // safe to ignore.
        }
    }

    /**
     * If `projectPath` already contains "real" user-visible content, prompt the
     * user with a modal warning before continuing. Hidden / metadata entries
     * (`.vscode`, `.git`, `.DS_Store`, `Thumbs.db`, etc.) are ignored — they
     * don't conflict with the cloned template files.
     *
     * If the user cancels, posts a silent `projectCreationFailed` message to
     * the webview so it returns to the gallery without showing an error, then
     * re-throws `UserCancelledError` so telemetry records the cancellation.
     */
    private async confirmTargetNotEmpty(actionContext: IActionContext, projectPath: string): Promise<void> {
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
        const proceed: vscode.MessageItem = { title: localize('proceedAnyway', 'Create here anyway') };
        try {
            // Modal dialogs add an automatic "Cancel" button — only pass the affirmative action.
            await actionContext.ui.showWarningMessage(
                localize('targetNotEmpty', 'The selected folder "{0}" is not empty. Existing files may be overwritten. Do you want to create this template here?', projectPath),
                { modal: true, stepName: 'targetNotEmpty' },
                proceed,
            );
        } catch (err) {
            if (err instanceof UserCancelledError) {
                this.postMessageToWebview({ type: 'projectCreationFailed', error: '' });
            }
            throw err;
        }
    }

    private async tryOpenReadme(projectPath: string): Promise<void> {
        // Try common README filename casings; first match wins.
        const candidates = ['README.md', 'README.MD', 'Readme.md', 'readme.md'];
        for (const name of candidates) {
            const readmePath = path.join(projectPath, name);
            if (await AzExtFsExtra.pathExists(readmePath)) {
                try {
                    await vscode.commands.executeCommand(
                        'markdown.showPreview',
                        vscode.Uri.file(readmePath),
                    );
                } catch {
                    // Fall back to opening the raw markdown if preview is unavailable.
                    try {
                        await vscode.window.showTextDocument(vscode.Uri.file(readmePath), {
                            preview: false,
                            viewColumn: vscode.ViewColumn.Active,
                        });
                    } catch {
                        // Give up silently — README is best-effort.
                    }
                }
                return;
            }
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

    private buildZipUrl(repositoryUrl: string, branch: string): string {
        const base = repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');
        return `${base}/archive/refs/heads/${branch}.zip`;
    }

    private async downloadAndExtractZip(context: IActionContext, repositoryUrl: string, branch: string, destDir: string): Promise<void> {
        const zipUrl = this.buildZipUrl(repositoryUrl, branch);
        const zipPath = `${destDir}.zip`;

        try {
            await requestUtils.downloadFile(context, zipUrl, zipPath, requestUtils.allowCrossOriginRedirectsOptions);
        } catch (err) {
            throw new Error(localize('zipDownloadFailed', 'Failed to download template zip: {0}', parseError(err).message), { cause: err });
        }

        try {
            await extractZip(zipPath, path.dirname(destDir));
        } finally {
            if (await AzExtFsExtra.pathExists(zipPath)) {
                await AzExtFsExtra.deleteResource(zipPath, { recursive: false });
            }
        }

        const repoName = repositoryUrl.replace(/\.git$/, '').split('/').pop() || 'template';
        const extractedFolder = path.join(path.dirname(destDir), `${repoName}-${branch}`);
        if (await AzExtFsExtra.pathExists(extractedFolder)) {
            await this.copyDirectory(extractedFolder, destDir);
            await AzExtFsExtra.deleteResource(extractedFolder, { recursive: true });
        }
    }

    private async copyDirectory(source: string, destination: string): Promise<void> {
        const entries = await AzExtFsExtra.readDirectory(source);
        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const destPath = path.join(destination, entry.name);

            if (entry.type === vscode.FileType.Directory) {
                await AzExtFsExtra.ensureDir(destPath);
                await this.copyDirectory(sourcePath, destPath);
            } else if (entry.type === vscode.FileType.File) {
                await AzExtFsExtra.copy(sourcePath, destPath, { overwrite: true });
            }
        }
    }

}

interface CopilotChatSkillsInstallResult {
    result: 'succeeded' | 'failed' | 'skipped';
    filesWritten?: number;
    message?: string;
}

async function installAzureFunctionsSkillsForCopilotChat(location: string): Promise<CopilotChatSkillsInstallResult> {
    const targetDir = resolveSkillsInstallTarget(location);
    if (!targetDir) {
        return {
            result: 'skipped',
            message: localize('skillsInstallNoWorkspace', 'No workspace folder is available for local Azure Functions Skills installation.'),
        };
    }

    try {
        const skills = await import('@azure/functions-skills/setup');
        const result = await skills.installLocalSkills({
            targetDir,
            agents: ['ghcp'],
            prerequisites: 'check-only',
            yes: true,
            checkForUpdates: false,
            initializeGitForGhcp: false,
        });

        const prerequisite = result.setup?.prerequisites?.find(item => item.id === 'azure-skills');
        return {
            result: 'succeeded',
            filesWritten: result.filesWritten,
            message: prerequisite?.message,
        };
    } catch (error) {
        const message = parseError(error).message;
        ext.outputChannel.appendLog(localize('skillsInstallError', 'Failed to install Azure Functions Skills locally: {0}', message));
        return { result: 'failed', message };
    }
}

function resolveSkillsInstallTarget(location: string): string | undefined {
    if (location) {
        return location;
    }

    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function languageGrounding(language: string): string {
    switch (language) {
        case 'TypeScript':
        case 'JavaScript':
            return `- Use the Azure Functions v4 programming model
- Each function is registered via app.http(), app.timer(), app.serviceBusQueue(), etc. in a single entry file (e.g. src/functions/index.ts)
- Include package.json with "@azure/functions": "^4.0.0" and (for TypeScript) typescript`;
        case 'Python':
            return `- Use the Azure Functions v2 programming model with decorators (@app.route, @app.timer_trigger, @app.event_grid_trigger, etc.)
- Single function_app.py at the project root
- Include requirements.txt with azure-functions`;
        case 'CSharp':
            return `- Use the .NET isolated worker model (Microsoft.Azure.Functions.Worker)
- Include a .csproj targeting net8.0 with Microsoft.Azure.Functions.Worker and Microsoft.Azure.Functions.Worker.Sdk
- Functions declared as static methods with [Function("Name")] attributes`;
        case 'Java':
            return `- Use Azure Functions for Java with @FunctionName annotations
- Include pom.xml with azure-functions-maven-plugin and azure-functions-java-library`;
        case 'PowerShell':
            return `- One folder per function with function.json and run.ps1
- Include profile.ps1 and requirements.psd1`;
        default:
            return `- Follow standard Azure Functions project layout for ${language}`;
    }
}
