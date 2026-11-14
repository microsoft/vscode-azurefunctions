/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError, callWithTelemetryAndErrorHandling, initializeWorkflowTelemetry, parseError, withTelemetryStage, type IActionContext } from '@microsoft/vscode-azext-utils';
import { TemplateGalleryController, registerWebviewExtensionVariables, type ExternalTabSelectionSource, type FilterState, type InitialTemplateFilters, type IProjectTemplate as ISharedProjectTemplate, type ProjectCreationEntryPoint, type TemplateGalleryConfig } from '@microsoft/vscode-azext-webview';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { cloneProjectTemplate } from '../../templates/projectTemplates/cloneProjectTemplate';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../templates/projectTemplates/ProjectTemplateProvider';
import { cpUtils } from '../../utils/cpUtils';
import { isPathEqual } from '../../utils/fs';
import { gitUtils } from '../../utils/gitUtils';
import { requestUtils } from '../../utils/requestUtils';
import { telemetryUtils } from '../../utils/telemetryUtils';
import { findFiles } from '../../utils/workspace';
import { extractZip } from '../../utils/zipUtils';
import { getWorkspaceSetting, updateGlobalSetting } from '../../vsCodeConfig/settings';
import { classicTemplateFeedSetting, hostFileName, packageJsonFileName, ProjectLanguage, showClassicTemplateFeedBannerSetting } from '../../constants';
import { initProjectForVSCode } from '../initProjectForVSCode/initProjectForVSCode';
import { getConnectorGalleryLaunchOptions, getConnectorGalleryTab, isConnectorGalleryTabMessage, type ExternalTabSelectedMessage } from './connectorGalleryTab';
import { ConnectorTriggerPickerController } from './connectorTriggerPicker/ConnectorTriggerPickerController';
import { createNewProjectInternal } from './createNewProject';
import { findTemplateFunctionFile } from './findTemplateFunctionFile';
import { type OpenBehavior } from './IProjectWizardContext';
import { installNodeDependencies } from './installNodeDependencies';
import { promptAndOpenProject } from './OpenFolderStep';
import { tryGetFunctionProjectRoot } from './verifyIsProject';

export interface TemplateGalleryLaunchOptions {
    initialLocation?: string;
    initialFilters?: InitialTemplateFilters;
}

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
    private isCreatingProject = false;
    private closeReason: 'abandoned' | 'projectCreated' | 'classic' | 'replaced' = 'abandoned';
    private readonly openedAt = Date.now();
    private templateIds = new Set<string>();
    private catalogRequests = 0;
    private readonly initialLocation: string | undefined;
    private readonly initialFilters: InitialTemplateFilters | undefined;

    private constructor(context: vscode.ExtensionContext, config: TemplateGalleryConfig, options: TemplateGalleryLaunchOptions) {
        super(context, config);
        this.templateProvider = new ProjectTemplateProvider();
        this.initialLocation = options.initialLocation;
        this.initialFilters = options.initialFilters;
        this.panel.webview.options = {
            ...this.panel.webview.options,
            enableCommandUris: ['azureFunctions.useClassicTemplateFeed', 'azureFunctions.dismissClassicTemplateFeedBanner'],
        };

        this.registerDisposable(
            this.onDisposed(() => {
                this.isPanelDisposed = true;
                FunctionsTemplateGalleryController.currentController = undefined;
                void callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.closed', actionContext => {
                    actionContext.telemetry.properties.reason = this.closeReason === 'abandoned' && this.isCreatingProject ? 'closedDuringCreation' : this.closeReason;
                    actionContext.telemetry.measurements.galleryDuration = (Date.now() - this.openedAt) / 1000;
                });
            }),
        );
    }

    public async useClassicTemplateFeed(
        actionContext: IActionContext,
        createClassicProject: typeof createNewProjectInternal = createNewProjectInternal,
    ): Promise<void> {
        actionContext.telemetry.maskEntireErrorMessage = true;
        if (this.isCreatingProject) {
            throw new Error(localize('templateGalleryCreationInProgress', 'Wait for project creation to finish before switching to the classic template feed.'));
        }
        this.isCreatingProject = true;
        actionContext.telemetry.properties.projectCreationExperience = 'classic';
        actionContext.telemetry.properties.projectCreationRouteReason = 'galleryBanner';
        actionContext.telemetry.properties.classicSwitchStage = 'savingPreference';
        try {
            await updateGlobalSetting(classicTemplateFeedSetting, true);
            actionContext.telemetry.properties.classicTemplateFeed = 'true';
            actionContext.telemetry.properties.classicPreferenceSaved = 'true';
            this.closeReason = 'classic';
            this.disposePanelIfOpen();
            actionContext.telemetry.properties.classicSwitchStage = 'classicWizard';
            await createClassicProject(actionContext, {});
            actionContext.telemetry.properties.classicSwitchStage = 'complete';
        } finally {
            this.isCreatingProject = false;
        }
    }

    public async dismissClassicTemplateFeedBanner(actionContext: IActionContext): Promise<void> {
        actionContext.telemetry.maskEntireErrorMessage = true;
        await updateGlobalSetting(showClassicTemplateFeedBannerSetting, false);
        actionContext.telemetry.properties.classicBannerDismissed = 'true';
        await this.panel.webview.postMessage({ type: 'dismissClassicTemplateFeedBanner' });
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        const html = super.getDocumentTemplate(webview);
        if (getWorkspaceSetting<boolean>(showClassicTemplateFeedBannerSetting) === false) {
            return html;
        }
        const message = vscode.l10n.t('Prefer the classic experience?');
        const link = vscode.l10n.t('Switch to classic');
        const dismiss = vscode.l10n.t('Dismiss classic experience banner');
        const banner = `<div id="classic-template-feed-banner" role="note" style="display: flex; align-items: center; flex-wrap: wrap; gap: 16px; padding: 6px 24px; background: var(--vscode-inputValidation-infoBackground, var(--vscode-editorWidget-background)); border-bottom: 1px solid var(--vscode-inputValidation-infoBorder, var(--vscode-widget-border)); border-left: 4px solid var(--vscode-editorInfo-foreground); color: var(--vscode-foreground); line-height: 20px;">
            <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 16 16" style="flex: none; color: var(--vscode-editorInfo-foreground);">
                <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor"/>
                <path d="M8 7v4" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="8" cy="4.5" r=".75" fill="currentColor"/>
            </svg>
            <div style="flex: 1; min-width: 180px;"><strong style="font-size: 14px;">${escapeHtml(message)}</strong></div>
            <a href="command:azureFunctions.useClassicTemplateFeed" style="display: inline-block; padding: 6px 12px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-contrastBorder, var(--vscode-button-border, transparent)); font-weight: 600; text-decoration: none; white-space: nowrap;">${escapeHtml(link)}</a>
            <a id="dismiss-classic-template-feed-banner" href="command:azureFunctions.dismissClassicTemplateFeedBanner" role="button" aria-label="${escapeHtml(dismiss)}" title="${escapeHtml(dismiss)}" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; color: var(--vscode-foreground); border-radius: 3px;">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </a>
        </div>`;
        const bannerScript = `
            window.addEventListener('message', event => {
                if (event.data?.type === 'dismissClassicTemplateFeedBanner') {
                    document.getElementById('classic-template-feed-banner')?.remove();
                }
            });
            const dismissBanner = document.getElementById('dismiss-classic-template-feed-banner');
            dismissBanner.addEventListener('keydown', event => {
                if (event.key === ' ') {
                    event.preventDefault();
                    dismissBanner.click();
                }
            });
        `;
        // Reuse the shared nonced script; removing only the banner preserves gallery state.
        return html.replace('<body>', `<body>${banner}`).replace('</script>', `${bannerScript}</script>`);
    }

    public static createOrShow(context: vscode.ExtensionContext, options: TemplateGalleryLaunchOptions = {}): FunctionsTemplateGalleryController {
        const existing = FunctionsTemplateGalleryController.currentController;
        if (existing) {
            // Recreate when launch options need to be reapplied. Explicit filters must
            // always be reapplied because the user may have changed them in the open panel.
            const hasNewLocation = options.initialLocation !== undefined &&
                (existing.initialLocation === undefined || !isPathEqual(existing.initialLocation, options.initialLocation));
            const hasNewFilters = options.initialFilters !== undefined ||
                !areInitialFiltersEqual(existing.initialFilters, options.initialFilters);
            if (hasNewLocation || hasNewFilters) {
                existing.closeReason = 'replaced';
                existing.panel.dispose();
            } else {
                existing.revealToForeground();
                void callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.opened', actionContext => {
                    actionContext.telemetry.properties.reused = 'true';
                });
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
            initialFilters: options.initialFilters,
            externalTabs: [getConnectorGalleryTab()],
        };

        FunctionsTemplateGalleryController.currentController = new FunctionsTemplateGalleryController(context, config, options);
        void callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.opened', actionContext => {
            actionContext.telemetry.properties.reused = 'false';
        });
        return FunctionsTemplateGalleryController.currentController;
    }

    // ── Abstract method implementations ──

    protected async fetchTemplates(): Promise<{ templates: ISharedProjectTemplate[]; defaultLocation: string }> {
        return await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.getTemplates', async (actionContext: IActionContext) => {
            actionContext.errorHandling.rethrow = true;
            actionContext.telemetry.maskEntireErrorMessage = true;
            actionContext.telemetry.properties.catalogRequest = this.catalogRequests++ === 0 ? 'initial' : 'reload';
            const templates = await this.templateProvider.getTemplates(actionContext);
            this.templateIds = new Set(templates.map(template => template.id));
            actionContext.telemetry.measurements.templateCount = templates.length;
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

    protected override onTemplateSelected(templateId: string): void {
        void callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.templateSelected', actionContext => {
            actionContext.telemetry.properties.templateId = this.telemetryTemplateId(templateId);
        });
    }

    protected override async browseFolder(): Promise<string | undefined> {
        return await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.browseFolder', async actionContext => {
            actionContext.errorHandling.rethrow = true;
            actionContext.telemetry.maskEntireErrorMessage = true;
            const location = await super.browseFolder();
            actionContext.telemetry.properties.outcome = location ? 'selected' : 'canceled';
            return location;
        });
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
            actionContext.telemetry.maskEntireErrorMessage = true;
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
        if (this.isCreatingProject) {
            throw new Error(localize('templateGalleryProjectAlreadyCreating', 'Wait for the current project creation operation to finish before starting another.'));
        }
        this.isCreatingProject = true;
        try {
            await this.createTemplateProject(sharedTemplate, language, location, entryPoint);
        } finally {
            this.isCreatingProject = false;
        }
    }

    private async createTemplateProject(sharedTemplate: ISharedProjectTemplate, language: string, location: string, entryPoint?: ProjectCreationEntryPoint): Promise<void> {
        const template = sharedTemplate as unknown as IProjectTemplate;
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.createProject', async (actionContext: IActionContext) => {
            initializeWorkflowTelemetry(actionContext, {
                workflow: 'createProject', command: 'templateGallery.createProject', stepNames: telemetryUtils.projectCreationStepNames,
            });
            actionContext.errorHandling.rethrow = true;
            actionContext.valuesToMask.push(location, template.repositoryUrl);
            actionContext.telemetry.maskEntireErrorMessage = true;
            actionContext.telemetry.properties.templateId = this.telemetryTemplateId(template.id);
            actionContext.telemetry.properties.language = telemetryLanguage(language);
            actionContext.telemetry.properties.entryPoint = entryPoint === 'card' || entryPoint === 'details' ? entryPoint : 'unknown';
            actionContext.telemetry.properties.creationStage = 'confirmTarget';
            actionContext.telemetry.properties.creationOutcome = 'started';
            await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.createProjectStarted', startedContext => {
                Object.assign(startedContext.telemetry.properties, actionContext.telemetry.properties);
            });

            const projectPath = location;
            const branch = template.branch || 'main';
            const specificFolder = template.folderPath && template.folderPath !== '.' ? template.folderPath : undefined;
            const tempDir = path.join(os.tmpdir(), `azfunc-template-${Date.now()}`);

            // If the chosen project path already contains "real" user-visible content,
            // confirm with the user before clobbering.
            try {
                await this.confirmTargetNotEmpty(actionContext, projectPath);
                await withTelemetryStage(actionContext, { stage: 'projectCreation' }, async () => {
                    actionContext.telemetry.properties.creationStage = 'download';
                    const gitInstalled = await this.isGitInstalled();
                    actionContext.telemetry.properties.downloadMethod = gitInstalled ? 'git' : 'zip';

                    if (gitInstalled) {
                        if (specificFolder) {
                            this.sendProgress('Cloning template (sparse)...');
                            await cloneProjectTemplate(template.repositoryUrl, branch, tempDir, specificFolder);

                            const sourceDir = path.join(tempDir, specificFolder);
                            if (!await AzExtFsExtra.pathExists(sourceDir)) {
                                throw new Error(`Template folder "${specificFolder}" not found in repository`);
                            }
                            this.sendProgress('Setting up project files...');
                            await AzExtFsExtra.ensureDir(projectPath);
                            actionContext.telemetry.properties.creationStage = 'copy';
                            await this.copyDirectory(sourceDir, projectPath);
                        } else {
                            this.sendProgress('Cloning template repository...');
                            await cloneProjectTemplate(template.repositoryUrl, branch, tempDir);

                            let sourceDir = tempDir;
                            if (template.subdirectory) {
                                sourceDir = path.join(tempDir, template.subdirectory);
                                if (!await AzExtFsExtra.pathExists(sourceDir)) {
                                    throw new Error(`Template subdirectory "${template.subdirectory}" not found in repository`);
                                }
                            }
                            this.sendProgress('Setting up project files...');
                            await AzExtFsExtra.ensureDir(projectPath);
                            actionContext.telemetry.properties.creationStage = 'copy';
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
                        actionContext.telemetry.properties.creationStage = 'copy';
                        await this.copyDirectory(sourceDir, projectPath);
                    }

                    if (language === ProjectLanguage.JavaScript || language === ProjectLanguage.TypeScript) {
                        actionContext.telemetry.properties.creationStage = 'dependencies';
                        for (const hostFile of await findFiles(projectPath, `**/${hostFileName}`)) {
                            const functionProjectPath = path.dirname(hostFile.fsPath);
                            if (await AzExtFsExtra.pathExists(path.join(functionProjectPath, packageJsonFileName))) {
                                this.sendProgress(localize('installingNpmDependencies', 'Installing npm dependencies...'));
                                await installNodeDependencies(actionContext, functionProjectPath);
                            }
                        }
                    }

                    actionContext.telemetry.properties.creationStage = 'initializeVSCode';
                    await telemetryUtils.runWithDurationTelemetry(actionContext, 'initializeVSCode', async () =>
                        await this.initializeProjectForVSCode(actionContext, projectPath, language));
                    actionContext.telemetry.properties.vscodeInitialized = 'true';

                    actionContext.telemetry.properties.creationStage = 'gitInit';
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
                        actionContext.telemetry.properties.gitInitialized = 'true';
                    } catch {
                        actionContext.telemetry.properties.gitInitialized = 'false';
                    }

                    actionContext.telemetry.properties.result = 'Succeeded';
                    actionContext.telemetry.properties.creationOutcome = 'succeeded';
                    actionContext.telemetry.properties.creationStage = 'created';
                    actionContext.telemetry.properties.projectCreated = 'true';
                    await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.projectCreated', completedContext => {
                        Object.assign(completedContext.telemetry.properties, actionContext.telemetry.properties);
                        Object.assign(completedContext.telemetry.measurements, actionContext.telemetry.measurements);
                        completedContext.telemetry.measurements.projectsCreated = 1;
                    });

                    // Open the README in the editor before disposing the webview so the user
                    // doesn't see an empty editor pane between dispose and the project opening.
                    await this.tryOpenReadme(projectPath);

                    this.closeReason = 'projectCreated';
                    this.disposePanelIfOpen();

                    void vscode.window.showInformationMessage(
                        localize('projectCreated', 'Project created successfully at {0}', projectPath),
                    );

                    // Match the classic wizard's post-create behavior: prompt the user how to
                    // open the newly created project (Open in current/new window, or Add to
                    // workspace) and then act on it via the shared OpenFolderStep. This keeps
                    // both flows consistent and reuses the same telemetry / activity output.
                    const functionFile = await findTemplateFunctionFile(projectPath, language);
                    actionContext.telemetry.properties.creationStage = 'openProject';
                    await this.promptAndOpenProject(actionContext, projectPath, functionFile);
                    actionContext.telemetry.properties.creationStage = 'complete';
                });
            } catch (error) {
                if (actionContext.telemetry.properties.projectCreated !== 'true') {
                    actionContext.telemetry.properties.creationOutcome = error instanceof UserCancelledError ? 'canceled' : 'failed';
                    if (error instanceof UserCancelledError) {
                        this.postMessageToWebview({ type: 'projectCreationFailed', error: '' });
                    }
                }
                throw error;
            } finally {
                try { await AzExtFsExtra.deleteResource(tempDir, { recursive: true }); } catch { /* ignore */ }
            }
        });
    }

    private async initializeProjectForVSCode(actionContext: IActionContext, projectPath: string, language: string): Promise<void> {
        this.sendProgress(localize('initializingGalleryProject', 'Initializing project for VS Code...'));
        const projectLanguage = Object.values(ProjectLanguage).find(value => value === language);
        const functionProjectPath = await tryGetFunctionProjectRoot(actionContext, projectPath, 'prompt', 'project');
        if (!functionProjectPath) {
            throw new Error(localize('missingFunctionsProject', 'No Azure Functions project was found. The project must contain a host.json file.'));
        }
        await initProjectForVSCode(actionContext, functionProjectPath, projectLanguage, projectPath);
    }

    private async promptAndOpenProject(actionContext: IActionContext, projectPath: string, functionFile?: string): Promise<void> {
        await promptAndOpenProject(actionContext, projectPath, functionFile,
            async behavior => await this.recordOpenBehavior(actionContext, behavior));
    }

    // ── Optional overrides ──

    private async recordOpenBehavior(actionContext: IActionContext, behavior: OpenBehavior | 'canceled' | undefined): Promise<void> {
        const knownBehaviors: (OpenBehavior | 'canceled' | undefined)[] = ['AddToWorkspace', 'OpenInNewWindow', 'OpenInCurrentWindow', 'AlreadyOpen', 'DontOpen', 'canceled'];
        const openBehavior = knownBehaviors.includes(behavior) ? behavior : 'unknown';
        actionContext.telemetry.properties.openBehavior = openBehavior;
        // Opening in the current window can restart the extension host.
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.openBehavior', context => {
            context.telemetry.properties.openBehavior = openBehavior;
        });
    }

    protected override async continueInChat(prompt: string, language: string): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.continueInChat', async (actionContext: IActionContext) => {
            actionContext.telemetry.maskEntireErrorMessage = true;
            actionContext.telemetry.properties.language = telemetryLanguage(language);
            actionContext.valuesToMask.push(prompt);

            const chatQuery = [
                `Please help me build an Azure Functions app.`,
                '',
                `**What I want to build:** ${prompt}`,
                '',
                `**Language:** ${language}`,
                '',
                `**Programming model & project structure:**`,
                languageGrounding(language),
                '',
                `**General guidelines:**`,
                `- Only use real trigger and binding types from the official Azure Functions SDK for ${language}`,
                `- Include host.json with extensionBundle configured for any non-HTTP bindings`,
                `- Include local.settings.json with the correct FUNCTIONS_WORKER_RUNTIME value`,
                `- Add a README.md with local setup steps and how to run the app`,
                `- Add brief inline comments explaining the key parts of the code`,
                '',
                `**Azure Functions best practices:**`,
                `- Keep functions stateless — do not store shared state in global variables`,
                `- Use output bindings instead of direct SDK/client calls where the binding supports it`,
                `- Prefer async/await patterns to avoid blocking the function host`,
                `- Use environment variables (application settings) for all secrets and connection strings, never hardcode them`,
                `- Use Managed Identity over connection strings when connecting to Azure services`,
                `- Keep each function focused on a single responsibility`,
                `- Use Durable Functions for long-running workflows or fan-out/fan-in patterns`,
                `- Handle errors gracefully and return meaningful HTTP status codes for HTTP triggers`,
            ].join('\n');

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
        return await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.useCachedTemplates', async actionContext => {
            actionContext.errorHandling.rethrow = true;
            actionContext.telemetry.maskEntireErrorMessage = true;
            await this.templateProvider.clearCache();
            return await this.fetchTemplates();
        });
    }

    protected override async onExternalTabSelected(tabId: string, source: ExternalTabSelectionSource, filters: FilterState): Promise<void> {
        const message: ExternalTabSelectedMessage = { type: 'externalTabSelected', tabId, source, filters };
        if (!isConnectorGalleryTabMessage(message)) {
            return;
        }

        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.openConnectorTriggers', async (actionContext: IActionContext) => {
            const launchOptions = await getConnectorGalleryLaunchOptions(actionContext, message, this.getDefaultLocation());
            ConnectorTriggerPickerController.createOrShow(this.extensionContext, launchOptions);
        });
    }

    // ── Helpers ──

    private getDefaultLocation(): string | undefined {
        return this.initialLocation ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    private telemetryTemplateId(templateId: string): string {
        return this.templateIds?.has(templateId) ? templateId : 'unknown';
    }

    private async isGitInstalled(): Promise<boolean> {
        return await gitUtils.isGitInstalled(os.tmpdir());
    }

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
        // Modal dialogs add an automatic "Cancel" button — only pass the affirmative action.
        await actionContext.ui.showWarningMessage(
            localize('targetNotEmpty', 'The selected folder "{0}" is not empty. Existing files may be overwritten. Do you want to create this template here?', projectPath),
            { modal: true, stepName: 'targetNotEmpty' },
            proceed,
        );
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

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => {
        switch (character) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            default: return '&#39;';
        }
    });
}

function telemetryLanguage(language: string): string {
    if (language === 'CSharp') {
        return ProjectLanguage.CSharp;
    }
    if (language === 'FSharp') {
        return ProjectLanguage.FSharp;
    }
    return telemetryUtils.getProjectLanguage(language);
}

function areInitialFiltersEqual(existing: InitialTemplateFilters | undefined, current: InitialTemplateFilters | undefined): boolean {
    return existing?.language === current?.language &&
        existing?.useCase === current?.useCase &&
        existing?.resource === current?.resource &&
        existing?.search === current?.search;
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
