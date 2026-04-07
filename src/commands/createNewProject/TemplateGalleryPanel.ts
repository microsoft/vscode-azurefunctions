/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../templates/projectTemplates/ProjectTemplateProvider';
import { cpUtils } from '../../utils/cpUtils';
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';

/**
 * Manages the Template Gallery webview panel
 */
export class TemplateGalleryPanel {
    public static currentPanel: TemplateGalleryPanel | undefined;
    private static readonly viewType = 'azureFunctionsTemplateGallery';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _templateProvider: ProjectTemplateProvider;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._templateProvider = new ProjectTemplateProvider();

        // Set the webview's initial html content
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                await this._handleMessage(message);
            },
            null,
            this._disposables
        );
    }

    /**
     * Create or show the template gallery panel
     */
    public static createOrShow(extensionUri: vscode.Uri): TemplateGalleryPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (TemplateGalleryPanel.currentPanel) {
            TemplateGalleryPanel.currentPanel._panel.reveal(column);
            return TemplateGalleryPanel.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            TemplateGalleryPanel.viewType,
            localize('templateGallery', 'Template Gallery'),
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'resources', 'webviews', 'templateGallery'),
                    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')
                ]
            }
        );

        TemplateGalleryPanel.currentPanel = new TemplateGalleryPanel(panel, extensionUri);
        return TemplateGalleryPanel.currentPanel;
    }

    /**
     * Dispose of the panel
     */
    public dispose(): void {
        TemplateGalleryPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Handle messages from the webview
     */
    private async _handleMessage(message: WebviewMessage): Promise<void> {
        switch (message.type) {
            case 'getTemplates':
                await this._sendTemplates();
                break;

            case 'refreshTemplates':
                await this._templateProvider.clearCache();
                await this._sendTemplates();
                break;

            case 'useCachedTemplates':
                await this._sendTemplates();
                break;

            case 'templateSelected': {
                ext.outputChannel.appendLog(localize('templateSelected', 'Template selected: {0}', String(message.templateId)));
                const template = message.template as IProjectTemplate;
                void this._sendReadme(template);
                break;
            }

            case 'browseFolder':
                await this._browseFolder(String(message.source || 'template'));
                break;

            case 'generateWithCopilot':
                await this._generateWithCopilot(String(message.prompt), String(message.language));
                break;

            case 'createAiProject':
                await this._createAiProject(message as CreateAiProjectMessage);
                break;

            case 'continueInChat':
                await this._continueInChat(
                    String(message.prompt || ''),
                    String(message.language || 'TypeScript'),
                    String(message.context || 'prompt'),
                    message.projectData as { title?: string; description?: string } | undefined
                );
                break;

            case 'createProject':
                await this._createProject(message as CreateProjectMessage);
                break;

            case 'showError':
                void vscode.window.showErrorMessage(String(message.message));
                break;
        }
    }

    /**
     * Send templates to the webview
     */
    private async _sendTemplates(): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.getTemplates', async (context: IActionContext) => {
            try {
                const templates = await this._templateProvider.getTemplates(context);

                // Get default location (current workspace folder if available)
                let defaultLocation = '';
                if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    defaultLocation = vscode.workspace.workspaceFolders[0].uri.fsPath;
                }

                await this._panel.webview.postMessage({
                    type: 'templates',
                    templates: templates,
                    defaultLocation: defaultLocation
                });
            } catch (error) {
                context.telemetry.properties.error = parseError(error).message;
                await this._panel.webview.postMessage({
                    type: 'error',
                    message: parseError(error).message
                });
            }
        });
    }

    /**
     * Open folder browser dialog
     */
    private async _browseFolder(source: string = 'template'): Promise<void> {
        const options: vscode.OpenDialogOptions = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: localize('select', 'Select'),
            title: localize('selectProjectLocation', 'Select project location')
        };

        const result = await vscode.window.showOpenDialog(options);
        if (result && result[0]) {
            await this._panel.webview.postMessage({
                type: 'folderSelected',
                path: result[0].fsPath,
                source: source
            });
        }
    }

    /**
     * Open Copilot Chat with a pre-filled context-aware prompt
     */
    private async _continueInChat(prompt: string, language: string, context: string, projectData?: { title?: string; description?: string }): Promise<void> {
        let chatQuery: string;

        if (context === 'success' && projectData) {
            chatQuery = [
                `I have an Azure Functions project already generated: "${projectData.title || 'Azure Functions App'}".`,
                projectData.description ? projectData.description : '',
                `Language: ${language}`,
                `My original requirements: ${prompt}`,
                '',
                `I'd like to refine or extend this project. Please follow Azure Functions best practices for ${language} and only use real trigger/binding types from the official Azure Functions SDK.`,
            ].filter(Boolean).join('\n');
        } else {
            const preamble = context === 'error'
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
            // Open Copilot Chat with the query pre-filled in a single command so
            // there is no race condition between session creation and query injection.
            // `newSession: true` is supported in VS Code 1.99+ and creates a fresh
            // chat session atomically alongside setting the query. On older VS Code
            // versions the flag is silently ignored and the query is still pre-filled
            // in the existing session, which is better than losing it entirely.
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: chatQuery,
                isPartialQuery: true,
                newSession: true
            });
            await this._panel.webview.postMessage({ type: 'chatOpened' });
        } catch (error) {
            ext.outputChannel.appendLog(localize('chatOpenError', 'Failed to open Copilot Chat: {0}', parseError(error).message));
            await this._panel.webview.postMessage({
                type: 'chatUnavailable',
                message: parseError(error).message
            });
        }
    }

    /**
     * Create project from template
     */
    private async _createProject(message: CreateProjectMessage): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.createProject', async (context: IActionContext) => {
            const { template, language, location } = message;

            context.telemetry.properties.templateId = template.id;
            context.telemetry.properties.language = language;

            const projectPath = location;

            try {
                const branch = template.branch || 'main';
                // folderPath of "." means the whole repo root — treat as full clone
                const specificFolder = template.folderPath && template.folderPath !== '.' ? template.folderPath : undefined;

                // Always clone into a unique temp dir so we never conflict with a pre-existing projectPath
                const tempDir = path.join(os.tmpdir(), `azfunc-template-${Date.now()}`);

                try {
                    const gitInstalled = await this._isGitInstalled();
                    context.telemetry.properties.downloadMethod = gitInstalled ? 'git' : 'zip';

                    if (gitInstalled) {
                        if (specificFolder) {
                            // Sparse checkout — only download the target subfolder
                            await this._sendProgress('Cloning template (sparse)...');
                            await cpUtils.executeCommand(undefined, undefined,
                                'git', 'clone', '--depth', '1', '--filter=blob:none', '--sparse',
                                '--branch', branch, template.repositoryUrl, tempDir);
                            await cpUtils.executeCommand(undefined, tempDir,
                                'git', 'sparse-checkout', 'set', specificFolder);

                            const sourceDir = path.join(tempDir, specificFolder);
                            if (!await AzExtFsExtra.pathExists(sourceDir)) {
                                throw new Error(`Template folder "${specificFolder}" not found in repository`);
                            }
                            await this._sendProgress('Setting up project files...');
                            await AzExtFsExtra.ensureDir(projectPath);
                            await this._copyDirectory(sourceDir, projectPath);
                        } else {
                            // Full clone into temp, then copy to projectPath
                            await this._sendProgress('Cloning template repository...');
                            await cpUtils.executeCommand(undefined, undefined,
                                'git', 'clone', '--depth', '1', '--branch', branch, template.repositoryUrl, tempDir);

                            let sourceDir = tempDir;
                            if (template.subdirectory) {
                                sourceDir = path.join(tempDir, template.subdirectory);
                                if (!await AzExtFsExtra.pathExists(sourceDir)) {
                                    throw new Error(`Template subdirectory "${template.subdirectory}" not found in repository`);
                                }
                            }
                            await this._sendProgress('Setting up project files...');
                            await AzExtFsExtra.ensureDir(projectPath);
                            await this._copyDirectory(sourceDir, projectPath);
                        }
                    } else {
                        // No git — download zip to temp, extract, copy to projectPath
                        await this._sendProgress('Downloading template (git not found, using zip)...');
                        await this._downloadAndExtractZip(template.repositoryUrl, branch, tempDir);

                        await this._sendProgress('Setting up project files...');
                        let sourceDir = tempDir;
                        if (specificFolder) {
                            sourceDir = path.join(tempDir, specificFolder);
                        } else if (template.subdirectory) {
                            sourceDir = path.join(tempDir, template.subdirectory);
                        }
                        await AzExtFsExtra.ensureDir(projectPath);
                        try {
                            await this._copyDirectory(sourceDir, projectPath);
                        } finally {
                            try { await AzExtFsExtra.deleteResource(tempDir, { recursive: true }); } catch { /* ignore */ }
                        }
                    }

                    await this._sendProgress('Initializing git repository...');
                    await cpUtils.executeCommand(undefined, projectPath, 'git init');

                } catch (downloadError) {
                    try { await AzExtFsExtra.deleteResource(tempDir, { recursive: true }); } catch { /* ignore */ }
                    throw downloadError;
                }

                // Clean up temp dir on success
                try { await AzExtFsExtra.deleteResource(tempDir, { recursive: true }); } catch { /* ignore */ }

                context.telemetry.properties.result = 'Succeeded';

                // Close panel and open project
                this.dispose();

                // Open the project
                const openInNewWindow = await vscode.window.showInformationMessage(
                    localize('projectCreated', 'Project created successfully!'),
                    localize('openInNewWindow', 'Open in New Window'),
                    localize('openInCurrentWindow', 'Open in Current Window'),
                    localize('addToWorkspace', 'Add to Workspace')
                );

                if (openInNewWindow === localize('openInNewWindow', 'Open in New Window')) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath), true);
                } else if (openInNewWindow === localize('openInCurrentWindow', 'Open in Current Window')) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath), false);
                } else if (openInNewWindow === localize('addToWorkspace', 'Add to Workspace')) {
                    vscode.workspace.updateWorkspaceFolders(
                        vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
                        null,
                        { uri: vscode.Uri.file(projectPath) }
                    );
                }

                // Auto-validate the new project with Copilot (fire-and-forget)
                void vscode.commands.executeCommand('azureFunctions.validateFunctionApp', vscode.Uri.file(projectPath));

            } catch (error) {
                context.telemetry.properties.result = 'Failed';
                context.telemetry.properties.error = parseError(error).message;

                await this._panel.webview.postMessage({
                    type: 'projectCreationFailed',
                    error: parseError(error).message
                });
            }
        });
    }

    /**
     * Fetch README.md from GitHub and send it to the webview
     */
    private async _sendReadme(template: IProjectTemplate): Promise<void> {
        await this._panel.webview.postMessage({ type: 'readmeLoading' });

        try {
            if (!template?.repositoryUrl) {
                ext.outputChannel.appendLog('README fetch skipped: no repositoryUrl on template');
                await this._panel.webview.postMessage({ type: 'readmeContent', markdown: '' });
                return;
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
            await this._panel.webview.postMessage({ type: 'readmeContent', markdown });
        } catch (error) {
            ext.outputChannel.appendLog(`README fetch failed: ${parseError(error).message}`);
            await this._panel.webview.postMessage({ type: 'readmeContent', markdown: '' });
        }
    }

    /**
     * Generate a project using GitHub Copilot via vscode.lm API
     */
    private async _generateWithCopilot(prompt: string, language: string): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.generateWithCopilot', async (context: IActionContext) => {
            context.telemetry.properties.language = language;

            await this._panel.webview.postMessage({ type: 'aiGenerating' });

            // Select best available Copilot model (no family = VS Code picks best + handles fallback)
            let models: vscode.LanguageModelChat[];
            try {
                models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            } catch (modelError) {
                await this._panel.webview.postMessage({
                    type: 'aiError',
                    error: localize('copilotSelectFailed', 'Could not connect to GitHub Copilot: {0}', parseError(modelError).message)
                });
                return;
            }

            if (!models.length) {
                await this._panel.webview.postMessage({
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
                    await this._panel.webview.postMessage({
                        type: 'aiError',
                        error: localize('copilotRequestFailed', 'Copilot request failed: {0}', error.message)
                    });
                } else {
                    await this._panel.webview.postMessage({
                        type: 'aiError',
                        error: parseError(error).message
                    });
                }
                return;
            } finally {
                cts.dispose();
            }

            ext.outputChannel.appendLog(`AI stream complete. Response length: ${fullResponse.length} chars`);

            // Extract JSON from response (model may wrap in markdown fences)
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

                context.telemetry.properties.fileCount = projectData.files.length.toString();
                context.telemetry.properties.result = 'Succeeded';

                ext.outputChannel.appendLog(`Generated project: "${projectData.title}" (${projectData.files.length} files)`);
                for (const f of projectData.files) {
                    ext.outputChannel.appendLog(`  + ${f.path}`);
                }

                await this._panel.webview.postMessage({
                    type: 'aiComplete',
                    title: projectData.title || 'Generated Azure Functions Project',
                    description: projectData.description || '',
                    files: projectData.files.map(f => f.path),
                    projectData: projectData
                });
            } catch (parseErr) {
                context.telemetry.properties.result = 'Failed';
                ext.outputChannel.appendLog(`AI parse error. Raw response length: ${fullResponse.length}`);
                await this._panel.webview.postMessage({
                    type: 'aiError',
                    error: localize('aiParseError', 'Could not parse Copilot response. Please try again with a more specific description.')
                });
            }
        });
    }

    /**
     * Build the system prompt for project generation
     */
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

    /**
     * Create a project from AI-generated file data
     */
    private async _createAiProject(message: CreateAiProjectMessage): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.createAiProject', async (context: IActionContext) => {
            const { files, location } = message;
            context.telemetry.properties.fileCount = files.length.toString();

            try {
                await this._sendProgress('Creating project files...');
                await AzExtFsExtra.ensureDir(location);

                for (const file of files) {
                    const safePath = file.path.replace(/^[/\\]/, '');
                    const filePath = path.join(location, safePath);
                    await AzExtFsExtra.ensureDir(path.dirname(filePath));
                    await fs.promises.writeFile(filePath, file.content, 'utf8');
                }

                await this._sendProgress('Initializing git repository...');
                try {
                    await cpUtils.executeCommand(undefined, location, 'git init');
                } catch {
                    // git init is optional — ignore if git is not installed
                }

                context.telemetry.properties.result = 'Succeeded';
                this.dispose();

                const openChoice = await vscode.window.showInformationMessage(
                    localize('aiProjectCreated', 'AI-generated project created successfully!'),
                    localize('openInNewWindow', 'Open in New Window'),
                    localize('openInCurrentWindow', 'Open in Current Window'),
                    localize('addToWorkspace', 'Add to Workspace')
                );

                if (openChoice === localize('openInNewWindow', 'Open in New Window')) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(location), true);
                } else if (openChoice === localize('openInCurrentWindow', 'Open in Current Window')) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(location), false);
                } else if (openChoice === localize('addToWorkspace', 'Add to Workspace')) {
                    vscode.workspace.updateWorkspaceFolders(
                        vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
                        null,
                        { uri: vscode.Uri.file(location) }
                    );
                }
            } catch (error) {
                context.telemetry.properties.result = 'Failed';
                await this._panel.webview.postMessage({
                    type: 'projectCreationFailed',
                    error: parseError(error).message
                });
            }
        });
    }

    /**
     * Send progress update to webview
     */
    private async _sendProgress(detail: string): Promise<void> {
        await this._panel.webview.postMessage({
            type: 'creatingProgress',
            detail: detail
        });
    }

    /**
     * Check whether git is available on PATH
     */
    private async _isGitInstalled(): Promise<boolean> {
        try {
            await cpUtils.executeCommand(undefined, undefined, 'git --version');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Build the GitHub zip download URL from a repository URL and branch name.
     * e.g. https://github.com/Azure-Samples/my-repo + main
     *   => https://github.com/Azure-Samples/my-repo/archive/refs/heads/main.zip
     */
    private _buildZipUrl(repositoryUrl: string, branch: string): string {
        const base = repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');
        return `${base}/archive/refs/heads/${branch}.zip`;
    }

    /**
     * Download a GitHub zip archive for the given repo/branch and extract it into destDir.
     * GitHub zips contain a single top-level folder named "{repo}-{branch}", so the
     * contents of that folder are moved up to destDir.
     */
    private async _downloadAndExtractZip(repositoryUrl: string, branch: string, destDir: string): Promise<void> {
        const zipUrl = this._buildZipUrl(repositoryUrl, branch);
        const zipPath = `${destDir}.zip`;

        // Download zip
        const response = await fetch(zipUrl);
        if (!response.ok) {
            throw new Error(localize('zipDownloadFailed', 'Failed to download template zip: HTTP {0}', response.status.toString()));
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(zipPath, buffer);

        // Extract using tar (available on Windows 10+, macOS, Linux)
        // Fall back to PowerShell's Expand-Archive on Windows if tar fails
        try {
            await cpUtils.executeCommand(undefined, undefined, `tar -xf "${zipPath}" -C "${path.dirname(destDir)}"`);
        } catch {
            if (process.platform === 'win32') {
                await cpUtils.executeCommand(undefined, undefined,
                    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${path.dirname(destDir)}' -Force"`);
            } else {
                await cpUtils.executeCommand(undefined, undefined, `unzip -q "${zipPath}" -d "${path.dirname(destDir)}"`);
            }
        }

        // Delete zip file
        await AzExtFsExtra.deleteResource(zipPath, { recursive: false });

        // GitHub extracts to "{repo}-{branch}/" — move its contents into destDir
        const repoName = repositoryUrl.replace(/\.git$/, '').split('/').pop() || 'template';
        const extractedFolder = path.join(path.dirname(destDir), `${repoName}-${branch}`);
        if (await AzExtFsExtra.pathExists(extractedFolder)) {
            await this._copyDirectory(extractedFolder, destDir);
            await AzExtFsExtra.deleteResource(extractedFolder, { recursive: true });
        }
    }

    /**
     * Recursively copy directory contents
     */
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

    /**
     * Generate the webview HTML content
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get resource URIs
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'webviews', 'templateGallery', 'styles.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'webviews', 'templateGallery', 'main.js')
        );
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf')
        );

        // Generate nonce for CSP
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:;">
    <title>Template Gallery</title>
    <style>
        @font-face {
            font-family: 'codicon';
            src: url('${codiconsUri}') format('truetype');
        }
        .codicon {
            font-family: 'codicon';
            font-size: 16px;
            line-height: 1;
        }
        .codicon-modifier-spin {
            animation: spin 1s infinite linear;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    </style>
    <link rel="stylesheet" href="${stylesUri}">
</head>
<body>
    <div id="app">
        <!-- Gallery View -->
        <div id="gallery-view" class="view active">
            <header class="gallery-header">
                <div class="header-content">
                    <h1>Create a new Azure Functions project</h1>
                    <p class="subtitle">Browse templates or describe what you want to build with GitHub Copilot</p>
                </div>
            </header>

            <!-- Mode Toggle -->
            <div class="mode-toggle">
                <button class="mode-tab active" id="browse-mode-tab">
                    <span class="codicon codicon-extensions"></span>
                    Browse Templates
                </button>
                <button class="mode-tab" id="ai-mode-tab">
                    <span class="codicon codicon-sparkle"></span>
                    Generate with Copilot
                </button>
            </div>

            <!-- Browse Mode Content -->
            <div id="browse-content">

            <div class="search-container">
                <span class="search-icon codicon codicon-search"></span>
                <input
                    type="text"
                    id="search-input"
                    class="search-input"
                    placeholder="Search templates..."
                    aria-label="Search templates"
                >
                <button id="clear-search" class="clear-search hidden" aria-label="Clear search">
                    <span class="codicon codicon-close"></span>
                </button>
            </div>

            <div class="filters-container">
                <div class="filter-group">
                    <label class="filter-label">Language:</label>
                    <div class="filter-chips" id="language-filters" role="radiogroup" aria-label="Filter by language">
                        <button class="filter-chip active" data-value="all" role="radio" aria-checked="true">All</button>
                        <button class="filter-chip" data-value="python" role="radio" aria-checked="false">Python</button>
                        <button class="filter-chip" data-value="dotnet" role="radio" aria-checked="false">.NET</button>
                        <button class="filter-chip" data-value="typescript" role="radio" aria-checked="false">TypeScript</button>
                        <button class="filter-chip" data-value="javascript" role="radio" aria-checked="false">JavaScript</button>
                        <button class="filter-chip" data-value="java" role="radio" aria-checked="false">Java</button>
                        <button class="filter-chip" data-value="go" role="radio" aria-checked="false">Go</button>
                        <button class="filter-chip" data-value="powershell" role="radio" aria-checked="false">PowerShell</button>
                    </div>
                </div>

                <div class="filter-group">
                    <label class="filter-label">Use Case:</label>
                    <div class="filter-chips" id="usecase-filters" role="group" aria-label="Filter by use case (select multiple)">
                        <button class="filter-chip active" data-value="all" role="checkbox" aria-checked="true">All</button>
                        <button class="filter-chip" data-value="starter" role="checkbox" aria-checked="false">Starter</button>
                        <button class="filter-chip" data-value="web-apis" role="checkbox" aria-checked="false">Web APIs</button>
                        <button class="filter-chip" data-value="event-processing" role="checkbox" aria-checked="false">Event Processing</button>
                        <button class="filter-chip" data-value="scheduling" role="checkbox" aria-checked="false">Scheduling</button>
                        <button class="filter-chip" data-value="ai-ml" role="checkbox" aria-checked="false">AI & ML</button>
                        <button class="filter-chip" data-value="data-processing" role="checkbox" aria-checked="false">Data Processing</button>
                        <button class="filter-chip" data-value="workflows" role="checkbox" aria-checked="false">Orchestrations</button>
                    </div>
                </div>
            </div>

            <div class="results-bar">
                <span id="results-count">Showing 0 templates</span>
            </div>

            <div id="templates-grid" class="templates-grid" role="list" aria-label="Templates">
            </div>

            <div id="empty-state" class="empty-state hidden">
                <span class="codicon codicon-inbox empty-icon"></span>
                <h2>No templates found</h2>
                <p>Try adjusting your filters or search</p>
                <button id="clear-filters" class="secondary-button">Clear all filters</button>
            </div>

            <div id="loading-state" class="loading-state">
                <span class="codicon codicon-loading codicon-modifier-spin"></span>
                <p>Loading templates...</p>
            </div>

            <div id="error-state" class="error-state hidden">
                <span class="codicon codicon-warning error-icon"></span>
                <h2>Unable to load templates</h2>
                <p>Check your internet connection and try again</p>
                <div class="error-actions">
                    <button id="retry-button" class="primary-button">Retry</button>
                    <button id="use-cached-button" class="secondary-button">Use Cached</button>
                </div>
            </div>

            <footer class="gallery-footer">
                <button id="refresh-templates" class="text-button">
                    <span class="codicon codicon-refresh"></span>
                    Refresh templates
                </button>
            </footer>

            </div><!-- end browse-content -->

            <!-- AI Mode Content -->
            <div id="ai-content" class="hidden">
                <div id="ai-prompt-section" class="ai-prompt-section">
                    <div class="ai-intro">
                        <span class="codicon codicon-sparkle ai-intro-icon"></span>
                        <div>
                            <h2 class="ai-intro-title">Generate with GitHub Copilot</h2>
                            <p class="ai-intro-description">Describe the Azure Function app you want to build. Copilot will generate a complete, working project tailored to your needs.</p>
                        </div>
                    </div>

                    <textarea
                        id="ai-prompt-input"
                        class="ai-textarea"
                        placeholder="e.g., I need an HTTP API that receives sensor readings, validates the data, and stores it in Azure Cosmos DB. It should also send alerts to a Service Bus queue when values exceed a threshold."
                        rows="5"
                        aria-label="Describe your function app"
                    ></textarea>

                    <div class="example-prompts">
                        <span class="example-label">Try an example:</span>
                        <div class="example-chips">
                            <button class="example-chip" data-prompt="HTTP API that accepts JSON sensor data, validates it, and stores it in Azure Cosmos DB">HTTP API → Cosmos DB</button>
                            <button class="example-chip" data-prompt="Timer function that runs every night at midnight to archive old blob files and log results to Application Insights">Nightly archive job</button>
                            <button class="example-chip" data-prompt="Process messages from an Azure Service Bus queue and send email notifications using Azure Communication Services">Service Bus → Email</button>
                            <button class="example-chip" data-prompt="Blob trigger that activates when an image is uploaded, analyzes it with Azure AI Vision, and saves results to a Cosmos DB container">AI image analysis pipeline</button>
                        </div>
                    </div>

                    <div class="ai-controls">
                        <div class="ai-language-group">
                            <label for="ai-language-select">Language</label>
                            <select id="ai-language-select" class="form-select ai-language-select">
                                <option value="TypeScript">TypeScript</option>
                                <option value="JavaScript">JavaScript</option>
                                <option value="Python">Python</option>
                                <option value="CSharp">C# (.NET)</option>
                                <option value="Java">Java</option>
                                <option value="PowerShell">PowerShell</option>
                            </select>
                        </div>
                        <button id="ai-generate-button" class="ai-generate-btn" disabled>
                            <span class="codicon codicon-sparkle"></span>
                            Generate Project
                        </button>
                    </div>

                    <!-- Continue in Copilot Chat secondary action -->
                    <div class="ai-chat-action">
                        <button id="ai-chat-link" class="ai-chat-link">
                            <span class="codicon codicon-comment-discussion"></span>
                            Continue in Copilot Chat
                        </button>
                        <span class="ai-chat-hint">For complex apps that need multi-turn design</span>
                    </div>

                    <details class="ai-chat-details">
                        <summary>What can Copilot Chat do?</summary>
                        <ul class="ai-chat-capabilities">
                            <li><span class="codicon codicon-check"></span> Multi-turn conversation to refine your app design</li>
                            <li><span class="codicon codicon-check"></span> Access to workspace files for context-aware generation</li>
                            <li><span class="codicon codicon-check"></span> Built-in tools: file editing, terminal, search</li>
                            <li><span class="codicon codicon-check"></span> Iterative code review and debugging assistance</li>
                        </ul>
                    </details>
                </div>

                <!-- Chat Confirmation Panel -->
                <div id="ai-chat-confirmation" class="ai-chat-confirmation hidden">
                    <span class="codicon codicon-comment-discussion ai-chat-confirmation-icon"></span>
                    <div class="ai-chat-confirmation-content">
                        <h3>Copilot Chat is opening&hellip;</h3>
                        <p>Your prompt has been pre-filled. Continue the conversation to design and generate your function app.</p>
                    </div>
                    <button id="ai-back-to-generator" class="ai-chat-link ai-back-link">
                        <span class="codicon codicon-arrow-left"></span>
                        Back to generator
                    </button>
                </div>

                <!-- AI Output Area -->
                <div id="ai-output" class="ai-output hidden">
                    <!-- Generating State -->
                    <div id="ai-generating-state" class="ai-generating-state">
                        <div class="ai-generating-header">
                            <span class="codicon codicon-loading codicon-modifier-spin ai-generating-icon"></span>
                            <div>
                                <p id="ai-status-text" class="ai-status-text">Analyzing your requirements...</p>
                                <p class="ai-status-sub">GitHub Copilot is generating your project</p>
                            </div>
                        </div>
                        <div class="ai-progress-steps">
                            <div class="ai-step active" id="ai-step-1"><span class="codicon codicon-loading codicon-modifier-spin"></span> Analyzing requirements</div>
                            <div class="ai-step" id="ai-step-2"><span class="codicon codicon-circle-outline"></span> Designing project structure</div>
                            <div class="ai-step" id="ai-step-3"><span class="codicon codicon-circle-outline"></span> Writing function code</div>
                            <div class="ai-step" id="ai-step-4"><span class="codicon codicon-circle-outline"></span> Adding configuration files</div>
                        </div>
                        <div id="ai-extended-wait" class="ai-extended-wait hidden">
                            <div class="ai-dots-container">
                                <span class="ai-dot"></span>
                                <span class="ai-dot"></span>
                                <span class="ai-dot"></span>
                            </div>
                            <div class="ai-extended-wait-text">
                                <span>Copilot is writing your project files&hellip;</span>
                                <span class="ai-extended-wait-sub">This can take 30–60 seconds for larger projects</span>
                            </div>
                        </div>
                    </div>

                    <!-- Success State -->
                    <div id="ai-success-state" class="ai-success-state hidden">
                        <div class="ai-success-header">
                            <span class="codicon codicon-check-all ai-success-icon"></span>
                            <div>
                                <h3 id="ai-project-title" class="ai-project-title"></h3>
                                <p id="ai-project-description" class="ai-project-description"></p>
                            </div>
                        </div>
                        <div class="ai-files-section">
                            <h4>Files that will be created:</h4>
                            <ul id="ai-files-list" class="ai-files-list"></ul>
                        </div>
                        <div class="form-group">
                            <label for="ai-location-input">Project Location</label>
                            <div class="location-input-group">
                                <input type="text" id="ai-location-input" class="form-input" readonly placeholder="Select a folder...">
                                <button type="button" id="ai-browse-button" class="secondary-button">Browse...</button>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" id="ai-create-button" class="primary-button" disabled>
                                <span class="codicon codicon-check"></span>
                                Create Project
                            </button>
                        </div>
                        <div class="ai-escalation">
                            <span>Want to refine this further?</span>
                            <button id="ai-chat-from-success" class="ai-chat-link">
                                <span class="codicon codicon-comment-discussion"></span>
                                Continue in Copilot Chat
                            </button>
                        </div>
                    </div>

                    <!-- Error State -->
                    <div id="ai-error-state" class="ai-error-state hidden">
                        <span class="codicon codicon-warning ai-error-icon"></span>
                        <p id="ai-error-message" class="ai-error-message"></p>
                        <button id="ai-retry-button" class="secondary-button">Try Again</button>
                        <div class="ai-escalation">
                            <span>Or try in Copilot Chat instead:</span>
                            <button id="ai-chat-from-error" class="ai-chat-link">
                                <span class="codicon codicon-comment-discussion"></span>
                                Continue in Copilot Chat
                            </button>
                        </div>
                    </div>
                </div>
            </div><!-- end ai-content -->

        </div>

        <!-- Configuration View -->
        <div id="config-view" class="view">
            <header class="config-header">
                <button id="back-button" class="back-button" aria-label="Back to gallery">
                    <span class="codicon codicon-arrow-left"></span>
                    Back
                </button>
                <h1>Configure your project</h1>
            </header>

            <div class="config-layout">
                <div class="config-left">
                    <div class="selected-template-card" id="selected-template">
                    </div>

                    <form id="config-form" class="config-form">
                        <div class="form-group">
                            <label for="language-select">Language</label>
                            <select id="language-select" class="form-select">
                            </select>
                            <span id="language-display" class="form-static hidden"></span>
                            <span class="form-hint" id="language-hint"></span>
                        </div>

                        <div class="form-group">
                            <label for="location-input">Project Location</label>
                            <div class="location-input-group">
                                <input type="text" id="location-input" class="form-input" required readonly>
                                <button type="button" id="browse-button" class="secondary-button">Browse...</button>
                            </div>
                        </div>

                        <div class="whats-included">
                            <h3>What's included:</h3>
                            <ul id="included-list" class="included-list">
                                <!-- Items will be inserted dynamically from template.whatsIncluded -->
                            </ul>
                        </div>

                        <div class="form-actions">
                            <button type="button" id="back-to-gallery" class="secondary-button">Back to Gallery</button>
                            <button type="submit" id="create-project" class="primary-button">Create Project</button>
                        </div>
                    </form>
                </div>

                <div class="config-right">
                    <div id="readme-loading" class="readme-loading hidden">
                        <span class="codicon codicon-loading codicon-modifier-spin"></span>
                        <span>Loading README...</span>
                    </div>
                    <div id="readme-content" class="readme-content"></div>
                </div>
            </div>
        </div>

        <!-- Creating View -->
        <div id="creating-view" class="view">
            <div class="creating-content">
                <span class="codicon codicon-loading codicon-modifier-spin creating-spinner"></span>
                <h2 id="creating-message">Creating project...</h2>
                <p id="creating-detail">Cloning template repository</p>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Generate a nonce for CSP
     */
    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

// Message types from webview
interface WebviewMessage {
    type: string;
    [key: string]: unknown;
}

interface CreateProjectMessage extends WebviewMessage {
    type: 'createProject';
    template: IProjectTemplate;
    language: string;
    location: string;
}

interface CreateAiProjectMessage extends WebviewMessage {
    type: 'createAiProject';
    files: Array<{ path: string; content: string }>;
    location: string;
}

/**
 * Returns a language-specific grounding block describing the correct programming model,
 * required packages, expected project files, and the FUNCTIONS_WORKER_RUNTIME value.
 * Injected into the Copilot Chat prompt to reduce hallucination.
 */
function _languageGrounding(language: string): string {
    const lang = language.toLowerCase();

    if (lang === 'python') {
        return [
            `- Use the Azure Functions v2 programming model`,
            `- Entry point: \`function_app.py\` using the \`@app\` decorator pattern (e.g. \`@app.route\`, \`@app.timer_trigger\`)`,
            `- Required files: \`function_app.py\`, \`requirements.txt\`, \`host.json\`, \`local.settings.json\``,
            `- Package: \`azure-functions>=1.21.0\` in requirements.txt`,
            `- FUNCTIONS_WORKER_RUNTIME: \`python\``,
            `- Prefer async functions (\`async def\`) to avoid blocking the worker`,
        ].join('\n');
    }

    if (lang === 'typescript') {
        return [
            `- Use the Azure Functions v4 programming model`,
            `- Define functions using \`app.http()\`, \`app.timer()\`, etc. from \`@azure/functions\``,
            `- Required files: \`src/functions/<name>.ts\`, \`package.json\`, \`tsconfig.json\`, \`host.json\`, \`local.settings.json\``,
            `- Packages: \`@azure/functions@^4.0.0\`, \`typescript@^5.0.0\` (devDependency)`,
            `- FUNCTIONS_WORKER_RUNTIME: \`node\``,
            `- Use \`async\` handler functions and return an \`HttpResponse\` for HTTP triggers`,
        ].join('\n');
    }

    if (lang === 'javascript') {
        return [
            `- Use the Azure Functions v4 programming model`,
            `- Define functions using \`app.http()\`, \`app.timer()\`, etc. from \`@azure/functions\``,
            `- Required files: \`src/functions/<name>.js\`, \`package.json\`, \`host.json\`, \`local.settings.json\``,
            `- Package: \`@azure/functions@^4.0.0\``,
            `- FUNCTIONS_WORKER_RUNTIME: \`node\``,
            `- Use \`async\` handler functions and return an \`HttpResponse\` for HTTP triggers`,
        ].join('\n');
    }

    if (lang === 'c#' || lang === 'csharp') {
        return [
            `- Use the .NET isolated worker model (not the in-process model)`,
            `- Entry point: \`Program.cs\` with \`HostBuilder\`; functions in individual class files`,
            `- Required files: \`Program.cs\`, \`<ProjectName>.csproj\`, \`host.json\`, \`local.settings.json\``,
            `- Packages: \`Microsoft.Azure.Functions.Worker\`, \`Microsoft.Azure.Functions.Worker.Sdk\`, \`Microsoft.Azure.Functions.Worker.Extensions.*\``,
            `- FUNCTIONS_WORKER_RUNTIME: \`dotnet-isolated\``,
            `- Use \`async Task\` methods and the \`[Function]\` attribute`,
        ].join('\n');
    }

    if (lang === 'java') {
        return [
            `- Use the Azure Functions Java annotation model`,
            `- Functions defined as methods with \`@FunctionName\` in a class`,
            `- Required files: \`src/main/java/.../Function.java\`, \`pom.xml\`, \`host.json\`, \`local.settings.json\``,
            `- Package: \`com.microsoft.azure.functions:azure-functions-java-library\` (latest stable)`,
            `- FUNCTIONS_WORKER_RUNTIME: \`java\``,
            `- Use the \`ExecutionContext\` parameter for logging`,
        ].join('\n');
    }

    if (lang === 'powershell') {
        return [
            `- Use the Azure Functions PowerShell worker model`,
            `- Each function in its own folder with \`run.ps1\` and \`function.json\``,
            `- Required files: \`run.ps1\`, \`function.json\`, \`requirements.psd1\`, \`profile.ps1\`, \`host.json\`, \`local.settings.json\``,
            `- Declare Az module dependencies in \`requirements.psd1\` (managed dependencies)`,
            `- FUNCTIONS_WORKER_RUNTIME: \`powershell\``,
            `- Use \`Push-OutputBinding\` to write output binding values`,
        ].join('\n');
    }

    // Fallback for any other language
    return [
        `- Use the latest stable Azure Functions programming model for ${language}`,
        `- Required files: function entry point, dependency manifest, \`host.json\`, \`local.settings.json\``,
        `- Set FUNCTIONS_WORKER_RUNTIME to the correct value for ${language}`,
    ].join('\n');
}
