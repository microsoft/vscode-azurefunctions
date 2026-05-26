/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, callWithTelemetryAndErrorHandling, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { TemplateGalleryController, type IProjectTemplate as ISharedProjectTemplate, type TemplateGalleryConfig } from '@microsoft/vscode-azext-webview';
import extract from 'extract-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../templates/projectTemplates/ProjectTemplateProvider';
import { cpUtils } from '../../utils/cpUtils';

/**
 * Azure Functions implementation of the shared TemplateGalleryController.
 * The shared package owns the UI, message routing, and panel lifecycle.
 * This subclass provides functions-specific business logic (template fetching,
 * project creation, AI generation, etc.).
 */
export class FunctionsTemplateGalleryController extends TemplateGalleryController {
    public static currentController: FunctionsTemplateGalleryController | undefined;

    private readonly _templateProvider: ProjectTemplateProvider;

    private constructor(context: vscode.ExtensionContext, config: TemplateGalleryConfig) {
        super(context, config);
        this._templateProvider = new ProjectTemplateProvider();

        this.registerDisposable(
            this.onDisposed(() => {
                FunctionsTemplateGalleryController.currentController = undefined;
            }),
        );
    }

    public static createOrShow(context: vscode.ExtensionContext): FunctionsTemplateGalleryController {
        if (FunctionsTemplateGalleryController.currentController) {
            FunctionsTemplateGalleryController.currentController.revealToForeground();
            return FunctionsTemplateGalleryController.currentController;
        }

        const config: TemplateGalleryConfig = {
            serviceName: 'Azure Functions',
            headerTitle: localize('templateGallery', 'Template Gallery'),
            headerSubtitle: localize('templateGallerySubtitle', 'Create a new Azure Functions project from a template'),
            supportsAiGeneration: true,
        };

        FunctionsTemplateGalleryController.currentController = new FunctionsTemplateGalleryController(context, config);
        return FunctionsTemplateGalleryController.currentController;
    }

    // ── Abstract method implementations ──

    protected async fetchTemplates(): Promise<{ templates: ISharedProjectTemplate[]; defaultLocation: string }> {
        return await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.getTemplates', async (actionContext: IActionContext) => {
            const templates = await this._templateProvider.getTemplates(actionContext);
            let defaultLocation = '';
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
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

        const response = await fetch(url);
        ext.outputChannel.appendLog(`README response: ${response.status}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const markdown = await response.text();
        ext.outputChannel.appendLog(`README length: ${markdown.length}`);
        return markdown;
    }

    protected async createProject(sharedTemplate: ISharedProjectTemplate, language: string, location: string): Promise<void> {
        const template = sharedTemplate as unknown as IProjectTemplate;
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.createProject', async (actionContext: IActionContext) => {
            actionContext.telemetry.properties.templateId = template.id;
            actionContext.telemetry.properties.language = language;

            const projectPath = location;
            const branch = template.branch || 'main';
            const specificFolder = template.folderPath && template.folderPath !== '.' ? template.folderPath : undefined;
            const tempDir = path.join(os.tmpdir(), `azfunc-template-${Date.now()}`);

            // If the chosen project path already contains "real" user-visible content,
            // confirm with the user before clobbering. We ignore hidden / metadata entries
            // (e.g. `.vscode`, `.git`, `.DS_Store`, `Thumbs.db`) that don't conflict with
            // the cloned template files.
            if (projectPath && await AzExtFsExtra.pathExists(projectPath)) {
                let existing: string[];
                try {
                    existing = await fs.promises.readdir(projectPath);
                } catch {
                    existing = [];
                }
                const ignoredNames = new Set(['Thumbs.db', 'desktop.ini', '.DS_Store']);
                const significant = existing.filter(name => !name.startsWith('.') && !ignoredNames.has(name));
                if (significant.length > 0) {
                    actionContext.telemetry.properties.nonEmptyTarget = 'true';
                    const proceed = localize('proceedAnyway', 'Create here anyway');
                    // Modal dialogs add an automatic "Cancel" button — only pass the affirmative action.
                    const choice = await vscode.window.showWarningMessage(
                        localize('targetNotEmpty', 'The selected folder "{0}" is not empty. Existing files may be overwritten. Do you want to create this template here?', projectPath),
                        { modal: true },
                        proceed
                    );
                    if (choice !== proceed) {
                        actionContext.telemetry.properties.result = 'Canceled';
                        // Send empty error so the webview goes back to the gallery silently (no error dialog).
                        this.postMessageToWebview({ type: 'projectCreationFailed', error: '' });
                        return;
                    }
                }
            }

            try {
                const gitInstalled = await this._isGitInstalled();
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
                        await this._copyDirectory(sourceDir, projectPath);
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
                        await this._copyDirectory(sourceDir, projectPath);
                    }
                } else {
                    this.sendProgress('Downloading template (git not found, using zip)...');
                    await this._downloadAndExtractZip(template.repositoryUrl, branch, tempDir);

                    this.sendProgress('Setting up project files...');
                    let sourceDir = tempDir;
                    if (specificFolder) {
                        sourceDir = path.join(tempDir, specificFolder);
                    } else if (template.subdirectory) {
                        sourceDir = path.join(tempDir, template.subdirectory);
                    }
                    await AzExtFsExtra.ensureDir(projectPath);
                    await this._copyDirectory(sourceDir, projectPath);
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
                await this._tryOpenReadme(projectPath);

                this.panel.dispose();

                void vscode.window.showInformationMessage(
                    localize('projectCreated', 'Project created successfully at {0}', projectPath),
                );
            } finally {
                try { await AzExtFsExtra.deleteResource(tempDir, { recursive: true }); } catch { /* ignore */ }
            }
        });
    }

    // ── Optional overrides ──

    protected override async generateWithCopilot(prompt: string, language: string): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.generateWithCopilot', async (actionContext: IActionContext) => {
            actionContext.telemetry.properties.language = language;

            let models: vscode.LanguageModelChat[];
            try {
                models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            } catch (modelError) {
                this.postMessageToWebview({
                    type: 'aiError',
                    error: localize('copilotSelectFailed', 'Could not connect to GitHub Copilot: {0}', parseError(modelError).message)
                });
                return;
            }

            if (!models.length) {
                this.postMessageToWebview({
                    type: 'aiError',
                    error: localize('copilotNotAvailable', 'GitHub Copilot is not available. Please install GitHub Copilot and sign in to use this feature.')
                });
                return;
            }

            const [model] = models;
            ext.outputChannel.appendLog(`AI generation using model: ${model.name} (${model.family})`);
            ext.outputChannel.appendLog(`Sending prompt to Copilot (language: ${language}, max tokens: ${model.maxInputTokens})`);

            const messages = [
                vscode.LanguageModelChatMessage.User(this._buildGenerationPrompt(language)),
                vscode.LanguageModelChatMessage.User(
                    `User request: ${prompt}\nLanguage: ${language}\n\nGenerate the complete Azure Functions project now. Return ONLY the JSON object, no other text or markdown fences.`
                )
            ];

            let fullResponse = '';
            const cts = new vscode.CancellationTokenSource();
            try {
                const chatResponse = await model.sendRequest(messages, {}, cts.token);
                for await (const fragment of chatResponse.text) {
                    fullResponse += fragment;
                }
            } catch (error) {
                if (error instanceof vscode.LanguageModelError) {
                    this.postMessageToWebview({
                        type: 'aiError',
                        error: localize('copilotRequestFailed', 'Copilot request failed: {0}', error.message)
                    });
                } else {
                    this.postMessageToWebview({
                        type: 'aiError',
                        error: parseError(error).message
                    });
                }
                return;
            } finally {
                cts.dispose();
            }

            ext.outputChannel.appendLog(`AI stream complete. Response length: ${fullResponse.length} chars`);

            try {
                const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    throw new Error('No JSON object found in response');
                }
                const projectData = JSON.parse(jsonMatch[0]) as {
                    title: string;
                    description: string;
                    files: Array<{ path: string; content: string }>;
                };

                if (!Array.isArray(projectData.files) || projectData.files.length === 0) {
                    throw new Error('Generated project has no files');
                }

                actionContext.telemetry.properties.fileCount = projectData.files.length.toString();
                actionContext.telemetry.properties.result = 'Succeeded';

                ext.outputChannel.appendLog(`Generated project: "${projectData.title}" (${projectData.files.length} files)`);
                for (const f of projectData.files) {
                    ext.outputChannel.appendLog(`  + ${f.path}`);
                }

                this.postMessageToWebview({
                    type: 'aiComplete',
                    title: projectData.title || 'Generated Azure Functions Project',
                    description: projectData.description || '',
                    files: projectData.files.map(f => f.path),
                    projectData: projectData
                });
            } catch (parseErr) {
                actionContext.telemetry.properties.result = 'Failed';
                ext.outputChannel.appendLog(`AI parse error. Raw response length: ${fullResponse.length}. ${parseError(parseErr).message}`);
                this.postMessageToWebview({
                    type: 'aiError',
                    error: localize('aiParseError', 'Could not parse Copilot response. Please try again with a more specific description.')
                });
            }
        });
    }

    protected override async createAiProject(files: Array<{ path: string; content: string }>, location: string): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.createAiProject', async (actionContext: IActionContext) => {
            actionContext.telemetry.properties.fileCount = files.length.toString();

            this.sendProgress('Creating project files...');

            let targetDir = location;
            if (await AzExtFsExtra.pathExists(targetDir)) {
                const existing = await fs.promises.readdir(targetDir);
                if (existing.length > 0) {
                    const folderName = `azure-functions-project-${Date.now()}`;
                    targetDir = path.join(location, folderName);
                }
            }
            await AzExtFsExtra.ensureDir(targetDir);

            for (const file of files) {
                const filePath = path.resolve(targetDir, file.path);
                const rel = path.relative(targetDir, filePath);
                if (rel.startsWith('..') || path.isAbsolute(rel)) {
                    actionContext.telemetry.properties.unsafePath = 'true';
                    throw new Error(localize('refuseUnsafePath', 'Refusing to write file outside project directory: {0}', file.path));
                }
                await AzExtFsExtra.ensureDir(path.dirname(filePath));
                await fs.promises.writeFile(filePath, file.content, 'utf8');
            }

            this.sendProgress('Initializing git repository...');
            try {
                await cpUtils.executeCommandLine(undefined, targetDir, 'git init');
            } catch {
                // git init optional
            }

            actionContext.telemetry.properties.result = 'Succeeded';
            await this._tryOpenReadme(targetDir);
            this.panel.dispose();

            void vscode.window.showInformationMessage(
                localize('aiProjectCreated', 'AI-generated project created successfully at {0}', targetDir),
            );
        });
    }

    protected override async continueInChat(prompt: string, language: string, contextType: string, projectData?: { title?: string; description?: string }): Promise<void> {
        let chatQuery: string;

        if (contextType === 'success' && projectData) {
            chatQuery = [
                `I have an Azure Functions project already generated: "${projectData.title || 'Azure Functions App'}".`,
                projectData.description ? projectData.description : '',
                `Language: ${language}`,
                `My original requirements: ${prompt}`,
                '',
                `I'd like to refine or extend this project. Please follow Azure Functions best practices for ${language} and only use real trigger/binding types from the official Azure Functions SDK.`,
            ].filter(Boolean).join('\n');
        } else {
            const preamble = contextType === 'error'
                ? `GitHub Copilot couldn't auto-generate this project. Please help me build it instead.`
                : `Please help me build an Azure Functions app.`;

            chatQuery = [
                preamble,
                '',
                `**What I want to build:** ${prompt}`,
                '',
                `**Language:** ${language}`,
                '',
                `**Programming model & project structure:**`,
                _languageGrounding(language),
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
        }

        try {
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: chatQuery,
                isPartialQuery: true,
                newSession: true
            });
            this.postMessageToWebview({ type: 'chatOpened' } as never);
        } catch (error) {
            ext.outputChannel.appendLog(localize('chatOpenError', 'Failed to open Copilot Chat: {0}', parseError(error).message));
            this.postMessageToWebview({ type: 'chatUnavailable', message: parseError(error).message } as never);
        }
    }

    protected override async fetchCachedTemplates(): Promise<{ templates: ISharedProjectTemplate[]; defaultLocation: string } | undefined> {
        await this._templateProvider.clearCache();
        return await this.fetchTemplates();
    }

    // ── Helpers ──

    private async _tryOpenReadme(projectPath: string): Promise<void> {
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

    private async _isGitInstalled(): Promise<boolean> {
        try {
            await cpUtils.executeCommandLine(undefined, undefined, 'git --version');
            return true;
        } catch {
            return false;
        }
    }

    private _buildZipUrl(repositoryUrl: string, branch: string): string {
        const base = repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');
        return `${base}/archive/refs/heads/${branch}.zip`;
    }

    private async _downloadAndExtractZip(repositoryUrl: string, branch: string, destDir: string): Promise<void> {
        const zipUrl = this._buildZipUrl(repositoryUrl, branch);
        const zipPath = `${destDir}.zip`;

        const response = await fetch(zipUrl);
        if (!response.ok) {
            throw new Error(localize('zipDownloadFailed', 'Failed to download template zip: HTTP {0}', response.status.toString()));
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(zipPath, buffer);

        try {
            await extract(zipPath, { dir: path.dirname(destDir) });
        } finally {
            if (await AzExtFsExtra.pathExists(zipPath)) {
                await AzExtFsExtra.deleteResource(zipPath, { recursive: false });
            }
        }

        const repoName = repositoryUrl.replace(/\.git$/, '').split('/').pop() || 'template';
        const extractedFolder = path.join(path.dirname(destDir), `${repoName}-${branch}`);
        if (await AzExtFsExtra.pathExists(extractedFolder)) {
            await this._copyDirectory(extractedFolder, destDir);
            await AzExtFsExtra.deleteResource(extractedFolder, { recursive: true });
        }
    }

    private async _copyDirectory(source: string, destination: string): Promise<void> {
        const entries = await AzExtFsExtra.readDirectory(source);
        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const destPath = path.join(destination, entry.name);

            if (entry.type === vscode.FileType.Directory) {
                await AzExtFsExtra.ensureDir(destPath);
                await this._copyDirectory(sourcePath, destPath);
            } else if (entry.type === vscode.FileType.File) {
                await AzExtFsExtra.copy(sourcePath, destPath, { overwrite: true });
            }
        }
    }

    private _buildGenerationPrompt(language: string): string {
        const languageInstructions: Record<string, string> = {
            'TypeScript': 'Use the Azure Functions v4 programming model. Include package.json with @azure/functions@^4.0.0 and typescript@^5.0.0, and tsconfig.json.',
            'JavaScript': 'Use the Azure Functions v4 programming model. Include package.json with @azure/functions@^4.0.0.',
            'Python': 'Use the Azure Functions v2 programming model with function decorators (@app.route, @app.event_grid_trigger, etc.). Include requirements.txt with azure-functions.',
            'CSharp': 'Use the .NET isolated worker model targeting net8.0. Include a .csproj file with Microsoft.Azure.Functions.Worker packages.',
            'Java': 'Use Azure Functions for Java. Include pom.xml with azure-functions-maven-plugin and azure-functions-java-library.',
            'PowerShell': 'Use Azure Functions for PowerShell. Include profile.ps1 and requirements.psd1.'
        };
        const langInstruction = languageInstructions[language] ?? `Use appropriate Azure Functions patterns for ${language}.`;

        return `You are an expert Azure Functions developer. Generate a complete, production-ready Azure Functions project based on the user's description.

${langInstruction}

Always include these files:
- host.json (with extensionBundle or appropriate runtime config)
- local.settings.json (with "AzureWebJobsStorage": "UseDevelopmentStorage:true" and correct "FUNCTIONS_WORKER_RUNTIME" value)
- README.md with prerequisites, local development setup steps, and deployment notes

Return ONLY a valid JSON object with absolutely no other text, explanations, or markdown code fences. Use this exact structure:
{
  "title": "Short descriptive project title",
  "description": "One-sentence description of what the project does",
  "files": [
    {"path": "relative/path/to/file.ext", "content": "complete file content here"}
  ]
}`;
    }
}

function _languageGrounding(language: string): string {
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
