/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';

interface LlmFinding {
    rule: string;
    severity: 'error' | 'warning' | 'info';
    file: string;
    line: number | null;
    message: string;
}

interface LlmResponse {
    findings: LlmFinding[];
}

// Maps FUNCTIONS_WORKER_RUNTIME values to skill file names
const runtimeToSkillFile: Record<string, string> = {
    python: 'python.md',
    node: 'node.md',
    dotnet: 'dotnet.md',
    'dotnet-isolated': 'dotnet.md',
    java: 'java.md',
    powershell: 'powershell.md',
};

// Files collected from the project for analysis (relative to project root)
const CONFIG_FILES = ['host.json', 'local.settings.json', 'requirements.txt', '.funcignore'];
// Max chars sent per source file to stay within token budget
const MAX_FILE_CHARS = 4000;
// Max number of function source files to include
const MAX_SOURCE_FILES = 6;

export async function validateFunctionApp(context: IActionContext, resourceUri?: vscode.Uri): Promise<void> {
    // Resolve project root from the resource URI, active editor, or workspace folder
    const projectRoot = resolveProjectRoot(resourceUri);
    if (!projectRoot) {
        void vscode.window.showWarningMessage(
            localize('validateNoProject', 'Open a Function App project folder before validating.')
        );
        return;
    }

    context.telemetry.properties.projectRoot = 'redacted';

    await callWithTelemetryAndErrorHandling('azureFunctions.validateFunctionApp', async (innerContext: IActionContext) => {
        // Detect runtime
        const runtime = detectRuntime(projectRoot);
        innerContext.telemetry.properties.runtime = runtime ?? 'unknown';

        if (!runtime) {
            void vscode.window.showWarningMessage(
                localize(
                    'validateNoRuntime',
                    'Could not detect Azure Functions runtime. Ensure local.settings.json contains FUNCTIONS_WORKER_RUNTIME.'
                )
            );
            return;
        }

        // Load skill content (common + runtime-specific)
        const skillContent = loadSkillContent(runtime);
        if (!skillContent) {
            void vscode.window.showWarningMessage(
                localize(
                    'validateNoSkill',
                    'No validation skill file found for runtime "{0}". Only Python is supported in this preview.',
                    runtime
                )
            );
            return;
        }

        // Collect project files
        const projectFiles = collectProjectFiles(projectRoot, runtime);
        innerContext.telemetry.measurements.fileCount = projectFiles.length;

        // Show progress notification
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: localize('validating', 'Azure Functions: Validating project with Copilot…'),
                cancellable: true,
            },
            async (_progress, token) => {
                const findings = await runLlmValidation(innerContext, skillContent, projectFiles, runtime, token);
                if (token.isCancellationRequested) return;

                innerContext.telemetry.measurements.findingCount = findings.length;
                innerContext.telemetry.measurements.errorCount = findings.filter(f => f.severity === 'error').length;
                innerContext.telemetry.measurements.warningCount = findings.filter(f => f.severity === 'warning').length;

                applyDiagnostics(findings, projectRoot);
                showValidationSummary(findings);
            }
        );
    });
}

// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------

function resolveProjectRoot(resourceUri?: vscode.Uri): string | undefined {
    // Priority: explicit URI (from context menu) → active editor file's workspace → first workspace folder
    if (resourceUri) {
        // If it's a file (e.g. host.json), use its directory
        const stat = fs.existsSync(resourceUri.fsPath)
            ? fs.statSync(resourceUri.fsPath)
            : undefined;
        return stat?.isDirectory() ? resourceUri.fsPath : path.dirname(resourceUri.fsPath);
    }

    const activeFile = vscode.window.activeTextEditor?.document.uri;
    if (activeFile) {
        const folder = vscode.workspace.getWorkspaceFolder(activeFile);
        if (folder) return folder.uri.fsPath;
    }

    if (vscode.workspace.workspaceFolders?.length) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

function detectRuntime(projectRoot: string): string | undefined {
    const settingsPath = path.join(projectRoot, 'local.settings.json');
    if (!fs.existsSync(settingsPath)) return undefined;

    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const runtime: string | undefined = settings?.Values?.FUNCTIONS_WORKER_RUNTIME;
        return runtime?.toLowerCase();
    } catch {
        return undefined;
    }
}

// ---------------------------------------------------------------------------
// Skill file loader — always loads functionapp.md (common) + runtime-specific
// ---------------------------------------------------------------------------

function loadSkillContent(runtime: string): string | undefined {
    const skillsDir = path.join(ext.context.extensionPath, 'resources', 'skills');

    // Common rules (always loaded)
    const commonPath = path.join(skillsDir, 'functionapp.md');
    const commonContent = fs.existsSync(commonPath) ? fs.readFileSync(commonPath, 'utf-8') : '';

    // Runtime-specific rules
    const runtimeFileName = runtimeToSkillFile[runtime];
    let runtimeContent = '';
    if (runtimeFileName) {
        const runtimePath = path.join(skillsDir, runtimeFileName);
        if (fs.existsSync(runtimePath)) {
            runtimeContent = fs.readFileSync(runtimePath, 'utf-8');
        }
    }

    if (!commonContent && !runtimeContent) return undefined;

    // Concatenate: common rules first, then language-specific additions
    return runtimeContent
        ? `${commonContent}\n\n---\n\n${runtimeContent}`
        : commonContent;
}

// ---------------------------------------------------------------------------
// Project file collection
// ---------------------------------------------------------------------------

interface ProjectFile {
    relativePath: string;
    content: string;
}

function collectProjectFiles(projectRoot: string, runtime: string): ProjectFile[] {
    const files: ProjectFile[] = [];

    // Always collect known config files
    for (const configFile of CONFIG_FILES) {
        const fullPath = path.join(projectRoot, configFile);
        if (fs.existsSync(fullPath)) {
            files.push({
                relativePath: configFile,
                content: readFileTruncated(fullPath),
            });
        }
    }

    // Collect function.json files (v1 model) and source files
    const sourceExtensions = getSourceExtensions(runtime);
    const functionSourceFiles = findFunctionSourceFiles(projectRoot, sourceExtensions);
    for (const file of functionSourceFiles.slice(0, MAX_SOURCE_FILES)) {
        files.push(file);
    }

    return files;
}

function getSourceExtensions(runtime: string): string[] {
    switch (runtime) {
        case 'python': return ['.py'];
        case 'node': return ['.js', '.ts'];
        case 'dotnet':
        case 'dotnet-isolated': return ['.cs'];
        case 'java': return ['.java'];
        case 'powershell': return ['.ps1'];
        default: return [];
    }
}

function findFunctionSourceFiles(projectRoot: string, extensions: string[]): ProjectFile[] {
    const results: ProjectFile[] = [];

    function walk(dir: string, depth: number): void {
        if (depth > 3) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') {
                continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                results.push({
                    relativePath: path.relative(projectRoot, fullPath).replace(/\\/g, '/'),
                    content: readFileTruncated(fullPath),
                });
            } else if (entry.name === 'function.json') {
                results.push({
                    relativePath: path.relative(projectRoot, fullPath).replace(/\\/g, '/'),
                    content: readFileTruncated(fullPath),
                });
            }
        }
    }

    walk(projectRoot, 0);
    return results;
}

function readFileTruncated(filePath: string): string {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.length <= MAX_FILE_CHARS) return content;
        return content.slice(0, MAX_FILE_CHARS) + `\n... [truncated at ${MAX_FILE_CHARS} chars]`;
    } catch {
        return '';
    }
}

// ---------------------------------------------------------------------------
// LLM validation
// ---------------------------------------------------------------------------

async function runLlmValidation(
    context: IActionContext,
    skillContent: string,
    projectFiles: ProjectFile[],
    runtime: string,
    token: vscode.CancellationToken
): Promise<LlmFinding[]> {
    // Select a Copilot model — try gpt-4o first, fall back to any Copilot model
    let models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
    if (!models.length) {
        models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    }

    if (!models.length) {
        const install = localize('installCopilot', 'Install GitHub Copilot');
        const choice = await vscode.window.showErrorMessage(
            localize(
                'noCopilotModel',
                'Azure Functions validation requires GitHub Copilot. ' +
                'Install the GitHub Copilot extension and sign in, then try again.'
            ),
            install
        );
        if (choice === install) {
            await vscode.commands.executeCommand(
                'workbench.extensions.search',
                'GitHub.copilot'
            );
        }
        return [];
    }

    const model = models[0];
    context.telemetry.properties.llmModel = model.name;
    ext.outputChannel.appendLog(localize('validatorModel', 'Azure Functions Validator using model: {0}', model.name));

    // Build file context section
    const fileSection = projectFiles
        .map(f => `### ${f.relativePath}\n\`\`\`\n${f.content}\n\`\`\``)
        .join('\n\n');

    const messages = [
        vscode.LanguageModelChatMessage.User(
            `${skillContent}\n\n---\n\n## Project Files\n\n${fileSection}`
        ),
    ];

    let rawResponse = '';
    try {
        const response = await model.sendRequest(messages, {}, token);
        for await (const chunk of response.text) {
            rawResponse += chunk;
        }
    } catch (err) {
        const msg = parseError(err).message;
        ext.outputChannel.appendLog(localize('validatorLlmError', 'LLM request failed: {0}', msg));
        throw err;
    }

    ext.outputChannel.appendLog(localize('validatorResponse', 'Validator received {0} chars from Copilot', rawResponse.length));

    return parseLlmResponse(rawResponse, runtime);
}

function parseLlmResponse(raw: string, runtime: string): LlmFinding[] {
    // Strip markdown fences if the model wrapped the JSON anyway
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

    try {
        const parsed: LlmResponse = JSON.parse(jsonStr);
        if (!Array.isArray(parsed?.findings)) return [];
        return parsed.findings.filter(
            f => f.rule && f.severity && f.file && f.message
        );
    } catch (err) {
        ext.outputChannel.appendLog(
            localize('validatorParseError', 'Failed to parse validator response for runtime {0}: {1}', runtime, parseError(err).message)
        );
        ext.outputChannel.appendLog(localize('validatorRawResponse', 'Raw response: {0}', raw.slice(0, 500)));
        return [];
    }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function severityToDiagnostic(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
        case 'error': return vscode.DiagnosticSeverity.Error;
        case 'warning': return vscode.DiagnosticSeverity.Warning;
        default: return vscode.DiagnosticSeverity.Information;
    }
}

function applyDiagnostics(findings: LlmFinding[], projectRoot: string): void {
    ext.diagnosticCollection.clear();

    // Group findings by file
    const byFile = new Map<string, LlmFinding[]>();
    for (const finding of findings) {
        const filePath = path.join(projectRoot, finding.file.replace(/\//g, path.sep));
        const existing = byFile.get(filePath) ?? [];
        existing.push(finding);
        byFile.set(filePath, existing);
    }

    for (const [filePath, fileFindings] of byFile) {
        const uri = vscode.Uri.file(filePath);
        const diagnostics = fileFindings.map(f => {
            // Use the reported line (0-based), fall back to line 0
            const lineNumber = f.line != null ? Math.max(0, f.line - 1) : 0;
            const range = new vscode.Range(lineNumber, 0, lineNumber, Number.MAX_SAFE_INTEGER);
            const diag = new vscode.Diagnostic(range, f.message, severityToDiagnostic(f.severity));
            diag.source = 'Azure Functions';
            diag.code = {
                value: f.rule,
                target: vscode.Uri.parse(
                    `https://learn.microsoft.com/azure/azure-functions/functions-best-practices`
                ),
            };
            return diag;
        });
        ext.diagnosticCollection.set(uri, diagnostics);
    }
}

// ---------------------------------------------------------------------------
// Summary notification
// ---------------------------------------------------------------------------

function showValidationSummary(findings: LlmFinding[]): void {
    const errors = findings.filter(f => f.severity === 'error').length;
    const warnings = findings.filter(f => f.severity === 'warning').length;
    const infos = findings.filter(f => f.severity === 'info').length;

    if (findings.length === 0) {
        void vscode.window.showInformationMessage(
            localize('validateClean', 'Azure Functions: No issues found. Your project follows best practices!')
        );
        return;
    }

    const parts: string[] = [];
    if (errors) parts.push(localize('validateErrors', '{0} error(s)', errors));
    if (warnings) parts.push(localize('validateWarnings', '{0} warning(s)', warnings));
    if (infos) parts.push(localize('validateInfos', '{0} suggestion(s)', infos));

    const summary = localize('validateSummary', 'Azure Functions: Found {0}. See the Problems panel for details.', parts.join(', '));

    void vscode.window.showWarningMessage(summary, localize('openProblems', 'Open Problems')).then(choice => {
        if (choice) {
            void vscode.commands.executeCommand('workbench.actions.view.problems');
        }
    });

    // Also log to output channel
    ext.outputChannel.appendLog('');
    ext.outputChannel.appendLog(localize('validateLogHeader', '=== Azure Functions Validation Results ==='));
    for (const f of findings) {
        ext.outputChannel.appendLog(`[${f.severity.toUpperCase()}] ${f.rule} ${f.file}${f.line ? `:${f.line}` : ''} — ${f.message}`);
    }
}