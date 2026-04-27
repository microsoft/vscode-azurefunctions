/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { requirementsFileName } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { cpUtils } from '../../utils/cpUtils';
import { venvUtils } from '../../utils/venvUtils';

const venvName = '.venv';

/**
 * Smart "Run Function App" command.
 *
 * Python flow:
 *   1. Detect project root from the active file or workspace.
 *   2. Ensure a Python virtual environment (.venv) exists — create it if missing.
 *   3. Install / refresh dependencies from requirements.txt.
 *   4. Launch `func start` in an integrated terminal with the venv activated.
 *
 * Node (JS/TS) flow:
 *   1. Detect project root from the active file or workspace.
 *   2. Run `npm install` if package.json exists.
 *   3. Run `npm run build` if a `build` script is defined in package.json.
 *   4. Launch `func start` in an integrated terminal.
 *
 * .NET flow:
 *   1. Detect project root from the active file or workspace.
 *   2. Run `dotnet build`.
 *   3. Launch `func start` in an integrated terminal.
 *
 * Other runtimes:
 *   Opens a terminal and runs `func start` directly (no setup required).
 */
export async function runFunctionApp(_context: IActionContext, resourceUri?: vscode.Uri): Promise<void> {
    await callWithTelemetryAndErrorHandling('azureFunctions.runFunctionApp', async (ctx: IActionContext) => {
        const projectRoot = await resolveProjectRoot(resourceUri);
        if (!projectRoot) {
            void vscode.window.showErrorMessage(
                localize('noProjectRoot', 'Could not locate an Azure Functions project root. Open a file inside a Function App project and try again.')
            );
            return;
        }

        const runtime = await detectRuntime(projectRoot);
        ctx.telemetry.properties.runtime = runtime ?? 'unknown';

        if (runtime === 'python') {
            await runPythonFunctionApp(ctx, projectRoot);
        } else if (runtime === 'node') {
            await runNodeFunctionApp(ctx, projectRoot);
        } else if (runtime === 'dotnet' || runtime === 'dotnet-isolated') {
            await runDotnetFunctionApp(ctx, projectRoot);
        } else {
            await runGenericFunctionApp(projectRoot);
        }
    });
}

// ---------------------------------------------------------------------------
// Python path
// ---------------------------------------------------------------------------

async function runPythonFunctionApp(context: IActionContext, projectRoot: string): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('settingUpFunctionApp', 'Azure Functions'),
            cancellable: false,
        },
        async (progress) => {

            // ── Step 1: ensure virtual environment ──────────────────────────
            const exists = await venvUtils.venvExists(venvName, projectRoot);

            if (!exists) {
                progress.report({ message: localize('creatingVenv', 'Creating Python virtual environment (.venv)...') });

                const pythonAlias = await findPythonAlias();
                if (!pythonAlias) {
                    throw new Error(
                        localize('noPythonFound',
                            'Could not find a Python interpreter. Install Python 3.8+ and ensure it is on your PATH, then try again.')
                    );
                }

                context.telemetry.properties.pythonAlias = pythonAlias;
                ext.outputChannel.appendLog(localize('creatingVenvLog', 'Creating virtual environment with {0}...', pythonAlias));
                await cpUtils.executeCommand(ext.outputChannel, projectRoot, pythonAlias, '-m', 'venv', venvName);
            } else {
                context.telemetry.properties.venvAlreadyExisted = 'true';
            }

            // ── Step 2: install / refresh requirements ───────────────────────
            const requirementsPath = path.join(projectRoot, requirementsFileName);
            if (await AzExtFsExtra.pathExists(requirementsPath)) {
                progress.report({ message: localize('installingRequirements', 'Installing requirements from requirements.txt...') });
                ext.outputChannel.appendLog(localize('runningPipInstall', 'Running pip install -r requirements.txt...'));

                try {
                    await venvUtils.runCommandInVenv(`pip install -r ${requirementsFileName}`, venvName, projectRoot);
                } catch {
                    // Non-fatal — warn and continue so the user can still attempt func start
                    void vscode.window.showWarningMessage(
                        localize('pipInstallWarning',
                            'Some packages could not be installed. Check the Azure Functions output channel for details.')
                    );
                }
            }

            progress.report({ message: localize('startingFuncHost', 'Starting Azure Functions host...') });
        }
    );

    // ── Step 3: run func start in an integrated terminal ─────────────────────
    context.telemetry.properties.startCommand = 'func start (python)';
    openFuncTerminal(projectRoot, path.join(projectRoot, venvName));
}

// ---------------------------------------------------------------------------
// Node (JavaScript / TypeScript) path
// ---------------------------------------------------------------------------

async function runNodeFunctionApp(context: IActionContext, projectRoot: string): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('settingUpFunctionApp', 'Azure Functions'),
            cancellable: false,
        },
        async (progress) => {
            const packageJsonPath = path.join(projectRoot, 'package.json');

            if (await AzExtFsExtra.pathExists(packageJsonPath)) {
                // ── Step 1: npm install ──────────────────────────────────────
                progress.report({ message: localize('npmInstall', 'Running npm install...') });
                ext.outputChannel.appendLog(localize('runningNpmInstall', 'Running npm install...'));

                try {
                    await cpUtils.executeCommand(ext.outputChannel, projectRoot, 'npm', 'install');
                } catch {
                    void vscode.window.showWarningMessage(
                        localize('npmInstallWarning',
                            'npm install encountered errors. Check the Azure Functions output channel for details.')
                    );
                }

                // ── Step 2: npm run build (if script exists) ─────────────────
                const hasBuildScript = await packageJsonHasScript(packageJsonPath, 'build');
                if (hasBuildScript) {
                    progress.report({ message: localize('npmBuild', 'Running npm run build...') });
                    ext.outputChannel.appendLog(localize('runningNpmBuild', 'Running npm run build...'));

                    try {
                        await cpUtils.executeCommand(ext.outputChannel, projectRoot, 'npm', 'run', 'build');
                    } catch {
                        void vscode.window.showWarningMessage(
                            localize('npmBuildWarning',
                                'npm run build encountered errors. Check the Azure Functions output channel for details.')
                        );
                    }
                }
            }

            progress.report({ message: localize('startingFuncHost', 'Starting Azure Functions host...') });
        }
    );

    // ── Step 3: func start ──────────────────────────────────────────────────
    context.telemetry.properties.startCommand = 'func start (node)';
    openFuncTerminal(projectRoot);
}

// ---------------------------------------------------------------------------
// .NET path
// ---------------------------------------------------------------------------

async function runDotnetFunctionApp(context: IActionContext, projectRoot: string): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('settingUpFunctionApp', 'Azure Functions'),
            cancellable: false,
        },
        async (progress) => {
            // ── Step 1: dotnet build ─────────────────────────────────────────
            progress.report({ message: localize('dotnetBuild', 'Running dotnet build...') });
            ext.outputChannel.appendLog(localize('runningDotnetBuild', 'Running dotnet build...'));

            try {
                await cpUtils.executeCommand(ext.outputChannel, projectRoot, 'dotnet', 'build');
            } catch {
                void vscode.window.showWarningMessage(
                    localize('dotnetBuildWarning',
                        'dotnet build encountered errors. Check the Azure Functions output channel for details.')
                );
            }

            progress.report({ message: localize('startingFuncHost', 'Starting Azure Functions host...') });
        }
    );

    // ── Step 2: func start ──────────────────────────────────────────────────
    context.telemetry.properties.startCommand = 'func start (dotnet)';
    openFuncTerminal(projectRoot);
}

// ---------------------------------------------------------------------------
// Non-Python / generic path
// ---------------------------------------------------------------------------

async function runGenericFunctionApp(projectRoot: string): Promise<void> {
    openFuncTerminal(projectRoot);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve project root with the same priority order as other commands:
 *   1. Explicit resourceUri argument — walk up from the file's directory
 *   2. Active editor's workspace folder — walk up from the file's directory
 *   3. First workspace folder
 *
 * In each case we walk upward from the starting directory until we find a
 * `host.json` file, stopping at the workspace folder boundary.  This
 * handles projects where the open file is inside a subdirectory (e.g.
 * `src/index.ts` in a TypeScript Functions project).
 */
async function resolveProjectRoot(resourceUri?: vscode.Uri): Promise<string | undefined> {
    let startDir: string | undefined;
    let ceiling: string | undefined;

    // Only use resourceUri if it points to an actual file on disk — non-file schemes
    // (e.g. walkThrough://, untitled://) cannot be resolved as filesystem paths.
    if (resourceUri?.scheme === 'file') {
        const stat = await AzExtFsExtra.pathExists(resourceUri.fsPath)
            ? await vscode.workspace.fs.stat(resourceUri)
            : undefined;
        startDir = stat?.type === vscode.FileType.Directory
            ? resourceUri.fsPath
            : path.dirname(resourceUri.fsPath);
        const ws = vscode.workspace.getWorkspaceFolder(resourceUri);
        ceiling = ws?.uri.fsPath;
    } else if (vscode.window.activeTextEditor) {
        const doc = vscode.window.activeTextEditor.document;
        const ws = vscode.workspace.getWorkspaceFolder(doc.uri);
        startDir = doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : ws?.uri.fsPath;
        ceiling = ws?.uri.fsPath;
    } else {
        startDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        ceiling = startDir;
    }

    if (!startDir) {
        return undefined;
    }

    return findHostJson(startDir, ceiling);
}

/**
 * Walk upward from `startDir` looking for a directory that contains
 * `host.json`.  Stops at `ceiling` (inclusive) to avoid escaping the
 * workspace.  If `ceiling` is undefined, only checks `startDir` itself.
 */
async function findHostJson(startDir: string, ceiling?: string): Promise<string | undefined> {
    let dir = startDir;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (await AzExtFsExtra.pathExists(path.join(dir, 'host.json'))) {
            return dir;
        }

        // Stop if we've reached the ceiling or the filesystem root
        if (ceiling && path.normalize(dir).toLowerCase() === path.normalize(ceiling).toLowerCase()) {
            break;
        }

        const parent = path.dirname(dir);
        if (parent === dir) {
            break; // filesystem root
        }
        dir = parent;
    }
    return undefined;
}

/**
 * Detect the Functions runtime for the project.
 *
 * 1. Check FUNCTIONS_WORKER_RUNTIME in local.settings.json (authoritative).
 * 2. Fallback: infer from well-known project files (package.json → node,
 *    requirements.txt → python) so the correct pre-start steps still run
 *    even when local.settings.json is missing or incomplete.
 */
async function detectRuntime(projectRoot: string): Promise<string | undefined> {
    // ── Primary: local.settings.json ────────────────────────────────────
    const settingsPath = path.join(projectRoot, 'local.settings.json');
    if (await AzExtFsExtra.pathExists(settingsPath)) {
        try {
            const raw = await AzExtFsExtra.readFile(settingsPath);
            const settings = JSON.parse(raw) as { Values?: Record<string, string> };
            const runtime = settings.Values?.FUNCTIONS_WORKER_RUNTIME?.toLowerCase();
            if (runtime) {
                return runtime;
            }
        } catch {
            // fall through to heuristic detection
        }
    }

    // ── Fallback: detect from project files ──────────────────────────────
    if (await AzExtFsExtra.pathExists(path.join(projectRoot, 'package.json'))) {
        return 'node';
    }
    if (await AzExtFsExtra.pathExists(path.join(projectRoot, requirementsFileName))) {
        return 'python';
    }
    if (await hasDotnetProjectFile(projectRoot)) {
        return 'dotnet';
    }

    return undefined;
}

/**
 * Try common Python aliases and return the first one that is executable.
 * Checks `python3` before `python` to prefer Python 3 on systems where
 * `python` may still point to Python 2.
 */
async function findPythonAlias(): Promise<string | undefined> {
    const candidates = ['python3', 'python', 'py'];
    for (const alias of candidates) {
        try {
            const result = await cpUtils.tryExecuteCommand(undefined, undefined, alias, '--version');
            if (result.code === 0 && result.cmdOutput.includes('Python 3')) {
                return alias;
            }
        } catch {
            // try next
        }
    }
    return undefined;
}

/**
 * Check whether a package.json contains a given npm script.
 */
async function packageJsonHasScript(packageJsonPath: string, scriptName: string): Promise<boolean> {
    try {
        const raw = await AzExtFsExtra.readFile(packageJsonPath);
        const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
        return !!pkg.scripts?.[scriptName];
    } catch {
        return false;
    }
}

/**
 * Check whether the project root contains a .csproj or .fsproj file.
 */
async function hasDotnetProjectFile(projectRoot: string): Promise<boolean> {
    try {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(projectRoot));
        return entries.some(([name]) => name.endsWith('.csproj') || name.endsWith('.fsproj'));
    } catch {
        return false;
    }
}

/**
 * Open (or reuse) the "Azure Functions: Run" terminal and run `func start`.
 * Disposes any existing run terminal first so each click starts fresh.
 *
 * For Python projects a **pseudo-terminal** is used instead of a regular
 * shell terminal.  The VS Code Python extension automatically sends its
 * own venv-activation command via `sendText` to every new shell terminal.
 * That injected text reaches the running `func start` process through the
 * PTY and causes it to exit prematurely.  A pseudo-terminal is immune to
 * this because `sendText` calls are routed to `handleInput()`, which we
 * control and can safely ignore.
 *
 * The venv is activated through environment variables (`VIRTUAL_ENV` and
 * `PATH`) set on the child process — functionally identical to sourcing
 * the activation script.
 */
function openFuncTerminal(cwd: string, venvPath?: string): void {
    vscode.window.terminals.find(t => t.name === 'Azure Functions: Run')?.dispose();

    if (venvPath) {
        const pty = new FuncStartTerminal(cwd, venvPath);
        const terminal = vscode.window.createTerminal({ name: 'Azure Functions: Run', pty });
        terminal.show();
    } else {
        const terminal = vscode.window.createTerminal({ name: 'Azure Functions: Run', cwd });
        terminal.show();
        terminal.sendText('func start');
    }
}

// ---------------------------------------------------------------------------
// Pseudo-terminal that runs `func start` as a direct child process
// ---------------------------------------------------------------------------

class FuncStartTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    readonly onDidWrite = this.writeEmitter.event;

    private readonly closeEmitter = new vscode.EventEmitter<number | void>();
    readonly onDidClose = this.closeEmitter.event;

    private process: ChildProcess | null = null;
    private exited = false;

    constructor(
        private readonly cwd: string,
        private readonly venvPath: string,
    ) {}

    open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
        const isWin = process.platform === 'win32';
        const binDir = path.join(this.venvPath, isWin ? 'Scripts' : 'bin');
        const env = {
            ...process.env,
            VIRTUAL_ENV: this.venvPath,
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
        };

        this.writeLine(`\x1b[36m[venv]\x1b[0m ${path.basename(this.venvPath)} activated`);
        this.writeLine(`\x1b[36m>\x1b[0m func start`);
        this.writeLine('');

        this.process = spawn('func', ['start'], {
            cwd: this.cwd,
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: isWin,
            windowsHide: true,
        });

        const onData = (data: Buffer) => {
            // Convert bare \n to \r\n for the terminal emulator
            this.writeEmitter.fire(data.toString().replace(/\r?\n/g, '\r\n'));
        };

        this.process.stdout?.on('data', onData);
        this.process.stderr?.on('data', onData);

        this.process.on('exit', (code) => {
            this.exited = true;
            this.writeLine('');
            this.writeLine(
                `\x1b[90mfunc start exited (code ${code ?? 'unknown'}). Press any key to close.\x1b[0m`,
            );
        });

        this.process.on('error', (err) => {
            this.exited = true;
            this.writeLine(`\x1b[31mError starting func: ${err.message}\x1b[0m`);
        });
    }

    close(): void {
        this.killProcess();
    }

    handleInput(data: string): void {
        // Ctrl+C — gracefully stop func start
        if (data === '\x03') {
            this.killProcess();
            return;
        }

        // After the process exits, any key closes the terminal
        if (this.exited) {
            this.closeEmitter.fire(0);
            return;
        }

        // All other input (including text injected by the Python extension's
        // auto-activation via sendText) is silently dropped.  func start does
        // not read stdin during normal operation.
    }

    private killProcess(): void {
        if (!this.process || this.exited) {
            return;
        }

        if (process.platform === 'win32') {
            // Kill the entire process tree on Windows
            spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'], {
                stdio: 'ignore',
            });
        } else {
            this.process.kill('SIGTERM');
        }
    }

    private writeLine(text: string): void {
        this.writeEmitter.fire(`${text}\r\n`);
    }
}
