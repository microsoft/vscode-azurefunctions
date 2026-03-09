/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProvisioningStatus, type AzdProvisioningTreeDataProvider, type ProvisioningSession } from './AzdProvisioningTreeDataProvider';

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/**
 * Matches azd provisioning resource lines in various states.
 *
 * Typical azd output (after stripping ANSI codes):
 *   (✓) Done: Resource group: rg-myapp
 *   (x) Failed: Storage account: stmyapp
 *   ( ) Creating: Function App: func-myapp
 *   Provisioning Azure resources (azd provision)
 */
const AZD_RESOURCE_LINE_RE = /\((?<marker>[✓x )⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏/\\|*-])\)\s*(?<verb>Done|Failed|Creating|Deleting|Updating)?:?\s*(?:(?<type>[^:]+):\s*)?(?<name>\S+)/;

/**
 * Matches the final summary line, e.g. "SUCCESS: Your application was provisioned"
 */
const AZD_PROVISION_SUCCESS_RE = /SUCCESS.*provisioned|Successfully provisioned/i;
const AZD_PROVISION_FAILURE_RE = /ERROR:|FAILED:|deployment failed/i;

/**
 * Matches azd progress/status lines that are not resource-specific,
 * e.g. "Provisioning Azure resources (azd provision)", "Packaging services...",
 * "Deploying services..." etc.
 */
const AZD_PROGRESS_LINE_RE = /^(?:Provisioning|Packaging|Deploying|Initializing|Downloading|Configuring|Waiting|Creating)\b/i;

/**
 * Runs `azd provision` in a VS Code terminal with shell integration, reads the
 * command output via `TerminalShellExecution.read()`, and feeds parsed resource
 * status updates into the {@link AzdProvisioningTreeDataProvider}.
 *
 * Usage (from AzdProvisionExecuteStep):
 * ```ts
 * const runner = new AzdProvisioningRunner(treeProvider);
 * await runner.run(tmpDir, ['provision', '--no-prompt'], 'myapp');
 * ```
 */
export class AzdProvisioningRunner implements vscode.Disposable {
    private readonly _treeProvider: AzdProvisioningTreeDataProvider;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor(treeProvider: AzdProvisioningTreeDataProvider) {
        this._treeProvider = treeProvider;
    }

    dispose(): void {
        this._disposables.forEach(d => d.dispose());
    }

    /**
     * Runs `azd <args>` in a new VS Code terminal, streaming output to the provisioning tree.
     *
     * @param cwd Working directory for the azd command
     * @param args Arguments to pass to `azd` (e.g. `['provision', '--no-prompt']`)
     * @param sessionLabel Optional label for the tree session
     * @param env Optional environment variables to set on the terminal process
     * @param expectedResources Optional list of resources to pre-register in the tree view.
     *   These appear immediately with a spinner so the user sees all resources even if azd
     *   doesn't report progress for each one individually.
     * @returns Resolves when the command finishes; rejects if it fails
     */
    async run(
        cwd: string,
        args: string[],
        sessionLabel?: string,
        env?: Record<string, string>,
        expectedResources?: { name: string; type: string }[],
    ): Promise<void> {
        const session = this._treeProvider.createSession(sessionLabel);

        // Pre-populate the session with expected resources so they appear in the tree
        // immediately with a spinner, even if azd doesn't report on each one individually.
        if (expectedResources) {
            for (const { name, type } of expectedResources) {
                this._treeProvider.updateResource(session, name, ProvisioningStatus.InProgress, type, 'Waiting...');
            }
        }

        const terminal = vscode.window.createTerminal({
            name: sessionLabel ?? 'azd provision',
            cwd,
            isTransient: true,
            env,
        });
        terminal.show(/* preserveFocus */ true);

        try {
            await this._executeAndStream(terminal, args, session);
        } finally {
            // Don't auto-dispose the terminal so the user can review output
        }
    }

    private async _executeAndStream(
        terminal: vscode.Terminal,
        args: string[],
        session: ProvisioningSession,
    ): Promise<void> {
        // Wait for shell integration to become available on this terminal
        const shellIntegration = await this._waitForShellIntegration(terminal);

        if (!shellIntegration) {
            // Fallback: send the command without tracking output
            terminal.sendText(`azd ${args.join(' ')}`);
            this._treeProvider.completeSession(session, ProvisioningStatus.InProgress);
            return;
        }

        // Execute via shell integration so we get a TerminalShellExecution with read()
        const execution = shellIntegration.executeCommand('azd', args);

        // Set up exit code listener before reading output
        const exitCodePromise = new Promise<number | undefined>((resolve) => {
            const listener = vscode.window.onDidEndTerminalShellExecution(event => {
                if (event.execution === execution) {
                    listener.dispose();
                    resolve(event.exitCode);
                }
            });
            this._disposables.push(listener);
        });

        // Read and parse the output stream
        await this._readOutput(execution, session);

        // Wait for exit code
        const exitCode = await exitCodePromise;
        if (exitCode !== undefined && exitCode !== 0) {
            this._treeProvider.completeSession(session, ProvisioningStatus.Failed);
            throw new Error(`azd provision failed with exit code ${exitCode}`);
        }
    }

    /**
     * Waits for shell integration to activate on the given terminal.
     * Returns undefined if it doesn't activate within the timeout.
     */
    private _waitForShellIntegration(terminal: vscode.Terminal, timeoutMs = 10000): Promise<vscode.TerminalShellIntegration | undefined> {
        // If already available, return immediately
        if (terminal.shellIntegration) {
            return Promise.resolve(terminal.shellIntegration);
        }

        return new Promise<vscode.TerminalShellIntegration | undefined>((resolve) => {
            const timer = setTimeout(() => {
                listener.dispose();
                resolve(undefined);
            }, timeoutMs);

            const listener = vscode.window.onDidChangeTerminalShellIntegration(({ terminal: t, shellIntegration }) => {
                if (t === terminal) {
                    clearTimeout(timer);
                    listener.dispose();
                    resolve(shellIntegration);
                }
            });

            this._disposables.push(listener);
        });
    }

    private async _readOutput(execution: vscode.TerminalShellExecution, session: ProvisioningSession): Promise<void> {
        let buffer = '';

        try {
            for await (const data of execution.read()) {
                buffer += data;
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? '';

                for (const rawLine of lines) {
                    this._processLine(rawLine, session);
                }
            }

            // Process remaining buffer
            if (buffer.trim()) {
                this._processLine(buffer, session);
            }

            // Determine final status from resources
            const hasFailures = [...session.resources.values()].some(r => r.status === ProvisioningStatus.Failed);
            this._treeProvider.completeSession(
                session,
                hasFailures ? ProvisioningStatus.Failed : ProvisioningStatus.Succeeded,
            );
        } catch {
            this._treeProvider.completeSession(session, ProvisioningStatus.Failed);
        }
    }

    private _processLine(rawLine: string, session: ProvisioningSession): void {
        const line = stripAnsi(rawLine).trim();
        if (!line) return;

        // Check for overall success/failure markers
        if (AZD_PROVISION_SUCCESS_RE.test(line)) {
            this._treeProvider.addMessage(session, line, 'info');
            this._treeProvider.markRemainingInProgressAs(session, ProvisioningStatus.Succeeded, 'Done');
            return;
        }

        if (AZD_PROVISION_FAILURE_RE.test(line)) {
            this._treeProvider.addMessage(session, line, 'error');
            this._treeProvider.markRemainingInProgressAs(session, ProvisioningStatus.Failed, 'Deployment failed');
            return;
        }

        // Parse individual resource status lines
        const match = AZD_RESOURCE_LINE_RE.exec(line);
        if (match?.groups) {
            const { marker, verb, type, name } = match.groups;
            const status = resolveStatus(marker, verb);
            const message = verb ?? statusToVerb(status);
            this._treeProvider.updateResource(session, name, status, type?.trim(), message);
        } else if (AZD_PROGRESS_LINE_RE.test(line)) {
            // Capture azd progress messages (e.g. "Provisioning Azure resources...", "Packaging services...")
            this._treeProvider.addMessage(session, line, 'info');
        }
    }
}

function stripAnsi(str: string): string {
    return str.replace(ANSI_ESCAPE_RE, '');
}

function resolveStatus(marker: string, verb?: string): ProvisioningStatus {
    if (marker === '✓' || verb === 'Done') {
        return ProvisioningStatus.Succeeded;
    }
    if (marker === 'x' || verb === 'Failed') {
        return ProvisioningStatus.Failed;
    }
    return ProvisioningStatus.InProgress;
}

function statusToVerb(status: ProvisioningStatus): string {
    switch (status) {
        case ProvisioningStatus.InProgress: return 'Creating...';
        case ProvisioningStatus.Succeeded: return 'Done';
        case ProvisioningStatus.Failed: return 'Failed';
    }
}
