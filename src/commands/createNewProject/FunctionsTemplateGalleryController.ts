/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { TemplateGalleryController, registerWebviewExtensionVariables, type InitialTemplateFilters, type IProjectTemplate as ISharedProjectTemplate, type ProjectCreationEntryPoint, type TemplateGalleryConfig } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type IProjectTemplate } from '../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../templates/projectTemplates/ProjectTemplateProvider';
import { isPathEqual } from '../../utils/fs';
import { requestUtils } from '../../utils/requestUtils';
import { ProjectTemplateCreator } from './ProjectTemplateCreator';

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
    private readonly projectCreator: ProjectTemplateCreator;
    private isPanelDisposed = false;
    private readonly initialLocation: string | undefined;
    private readonly initialFilters: InitialTemplateFilters | undefined;

    private constructor(context: vscode.ExtensionContext, config: TemplateGalleryConfig, options: TemplateGalleryLaunchOptions) {
        super(context, config);
        this.templateProvider = new ProjectTemplateProvider();
        this.projectCreator = new ProjectTemplateCreator({
            onProjectCreated: () => this.disposePanelIfOpen(),
            onUserCancelled: () => this.postMessageToWebview({
                type: 'projectCreationFailed',
                error: '',
            }),
            reportProgress: detail => this.sendProgress(detail),
        });
        this.initialLocation = options.initialLocation;
        this.initialFilters = options.initialFilters;

        this.registerDisposable(
            this.onDisposed(() => {
                this.isPanelDisposed = true;
                FunctionsTemplateGalleryController.currentController = undefined;
            }),
        );
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
                existing.panel.dispose();
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
            initialFilters: options.initialFilters,
        };

        FunctionsTemplateGalleryController.currentController = new FunctionsTemplateGalleryController(context, config, options);
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
            await this.projectCreator.createProject(
                actionContext,
                template,
                language,
                location,
                entryPoint,
            );
        });
    }

    // ── Optional overrides ──

    protected override async continueInChat(prompt: string, language: string): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.templateGallery.continueInChat', async (actionContext: IActionContext) => {
            actionContext.telemetry.properties.language = language;

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
