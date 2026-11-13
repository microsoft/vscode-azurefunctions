/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '@microsoft/vscode-processutils';
import * as vscode from 'vscode';
import { azureFunctionsNpmTaskType } from '../constants';
import { cpUtils } from '../utils/cpUtils';
import { getLoginShellPathForCommand } from '../utils/loginShellPath';
import { getTaskEnvironmentLayers, mergeEnvironmentLayers } from './resolveDebugHostTarget';

type NpmScript = 'install' | 'prune' | 'build' | 'watch' | 'clean';
type NpmTaskDefinition = vscode.TaskDefinition & { script: NpmScript };

const npmScriptArgs: Record<NpmScript, string[]> = {
    install: ['install'],
    prune: ['prune', '--production'],
    build: ['run', 'build'],
    watch: ['run', 'watch'],
    clean: ['run', 'clean'],
};

export class NpmTaskProvider implements vscode.TaskProvider {
    public provideTasks(): vscode.Task[] {
        return [];
    }

    public resolveTask(task: vscode.Task): vscode.Task | undefined {
        const script = task.definition.script;
        if (task.definition.type !== azureFunctionsNpmTaskType || !isNpmScript(script) ||
            task.scope === undefined || task.scope === vscode.TaskScope.Global || task.scope === vscode.TaskScope.Workspace) {
            return undefined;
        }

        const folder: vscode.WorkspaceFolder = task.scope;
        const definition: NpmTaskDefinition = { ...task.definition, script };
        const execution = new vscode.CustomExecution(() => Promise.resolve(new NpmTaskTerminal(folder, script)));
        return new vscode.Task(definition, folder, task.name, task.source, execution, task.problemMatchers);
    }
}

class NpmTaskTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    private readonly closeEmitter = new vscode.EventEmitter<number | void>();
    private readonly cancellation = new vscode.CancellationTokenSource();
    private closed: boolean = false;

    public readonly onDidWrite = this.writeEmitter.event;
    public readonly onDidClose = this.closeEmitter.event;

    constructor(private readonly folder: vscode.WorkspaceFolder, private readonly script: NpmScript) { }

    public open(): void {
        void this.run();
    }

    public close(): void {
        this.closed = true;
        this.cancellation.cancel();
        this.writeEmitter.dispose();
        this.closeEmitter.dispose();
        this.cancellation.dispose();
    }

    private async run(): Promise<void> {
        try {
            const environment: Record<string, string> = mergeEnvironmentLayers(getTaskEnvironmentLayers(undefined, this.folder));
            const loginShellPath: string | undefined = await getLoginShellPathForCommand('npm', environment.PATH);
            if (this.closed) {
                return;
            }
            if (loginShellPath) {
                environment.PATH = loginShellPath;
            }

            this.writeEmitter.fire(`> npm ${npmScriptArgs[this.script].join(' ')}\r\n`);
            const result: cpUtils.ICommandResult = await cpUtils.tryExecuteCommand(undefined, this.folder.uri.fsPath, 'npm', npmScriptArgs[this.script], environment, {
                cancellationToken: this.cancellation.token,
                onOutput: output => {
                    if (!this.closed) {
                        this.writeEmitter.fire(output);
                    }
                },
            });
            this.finish(result.code);
        } catch (error) {
            if (isCancellationError(error)) {
                this.finish(130);
            } else {
                if (!this.closed) {
                    this.writeEmitter.fire(`${error instanceof Error ? error.message : String(error)}\r\n`);
                }
                this.finish(1);
            }
        }
    }

    private finish(code: number): void {
        if (!this.closed) {
            this.closed = true;
            this.closeEmitter.fire(code);
        }
    }
}

function isNpmScript(script: unknown): script is NpmScript {
    return typeof script === 'string' && Object.prototype.hasOwnProperty.call(npmScriptArgs, script);
}
