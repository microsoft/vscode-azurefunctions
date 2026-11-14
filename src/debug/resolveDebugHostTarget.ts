/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { func, hostFileName } from '../constants';
import { isFuncHostTask } from '../funcCoreTools/funcHostTask';
import { type ConnectorTriggerHostLaunch } from './connectorNamespace/connectorTriggerF5Contracts';

export type DebugHostTaskExecution = 'shell' | 'process' | 'custom';

export type EnvironmentLayer = Readonly<Record<string, string | null | undefined>>;

export type DebugHostTargetSource = 'task' | 'taskOutsideProject' | 'taskUnresolvedCwd' | 'workspaceDefault';

export interface DebugHostTarget {
    /**
     * Project used for pre-debug validation, or undefined when no project can be identified.
     */
    projectPath: string | undefined;
    /**
     * Complete effective environment of the selected host task, when that task was found.
     */
    environment?: Readonly<Record<string, string>>;
    /**
     * Ordered process, terminal, and task environment layers that produced `environment`. Null marks a deleted name.
     */
    environmentLayers?: readonly Readonly<Record<string, string | null | undefined>>[];
    /**
     * Execution kind of the selected host task, when that task was found.
     */
    execution?: DebugHostTaskExecution;
    standardFunctionsTask?: true;
    /**
     * False when the selected host task is known not to run `projectPath`, so project-specific Azure setup must not run.
     */
    hostTaskTargetsProject: boolean;
    source: DebugHostTargetSource;
}

type TaskExecutionWithOptions = { options?: { cwd?: string; env?: Record<string, string> } };

export function getDebugHostLaunch(target: DebugHostTarget): ConnectorTriggerHostLaunch | undefined {
    if (!target.hostTaskTargetsProject || !target.execution || !target.environment) {
        return undefined;
    }

    const launch = {
        kind: 'task' as const,
        execution: target.execution,
        environment: target.environment,
        environmentLayers: target.environmentLayers,
        ...(target.standardFunctionsTask ? { standardFunctionsTask: true as const } : {}),
    };
    return launch;
}

// Build/publish output folders often contain a copied host.json; the source project is the folder above them.
const buildOutputSegments: ReadonlySet<string> = new Set(['bin', 'obj', 'target']);

/**
 * Resolves the Functions project and environment of the host task that F5 will actually run, mirroring how
 * `pickFuncProcess` selects that task. Falls back to the workspace default project only when the task can't be found.
 */
export async function resolveDebugHostTarget(
    context: IActionContext,
    workspace: vscode.WorkspaceFolder,
    debugConfig: vscode.DebugConfiguration,
    fetchTasks: () => Thenable<vscode.Task[]> = () => vscode.tasks.fetchTasks(),
): Promise<DebugHostTarget> {
    const task = findDebugHostTask(await fetchTasks(), workspace, debugConfig.preLaunchTask as string | undefined);
    if (!task) {
        return {
            projectPath: await tryGetFunctionProjectRoot(context, workspace, 'modalPrompt'),
            hostTaskTargetsProject: true,
            source: 'workspaceDefault',
        };
    }

    const options = (task.execution as TaskExecutionWithOptions | undefined)?.options;
    const environmentLayers = getTaskEnvironmentLayers(options?.env, workspace);
    const args: unknown = task.definition.args;
    const standardFunctionsTask = task.definition.type === func &&
        typeof task.definition.command === 'string' && /^(?:host\s+)?start$/i.test(task.definition.command.trim()) &&
        (args === undefined || Array.isArray(args) && args.every(argument =>
            typeof argument === 'string' && !/^(?:--?|\/)script-root(?:=|$)/i.test(argument)));
    const launch = {
        environment: mergeEnvironmentLayers(environmentLayers),
        environmentLayers,
        execution: getTaskExecutionKind(task),
        ...(standardFunctionsTask ? { standardFunctionsTask: true as const } : {}),
    };
    const cwd = resolveTaskVariables(options?.cwd ?? workspace.uri.fsPath, workspace);
    if (cwd === undefined) {
        return {
            projectPath: await tryGetFunctionProjectRoot(context, workspace, 'silent'),
            ...launch,
            hostTaskTargetsProject: false,
            source: 'taskUnresolvedCwd',
        };
    }

    const projectPath = await findProjectContainingPath(path.resolve(workspace.uri.fsPath, cwd), workspace.uri.fsPath);
    if (projectPath) {
        return { projectPath, ...launch, hostTaskTargetsProject: true, source: 'task' };
    }

    // Preserve the historical non-prompting project choice for generic validation, but never treat it as the host's project.
    return {
        projectPath: await tryGetFunctionProjectRoot(context, workspace, 'silent'),
        ...launch,
        hostTaskTargetsProject: false,
        source: 'taskOutsideProject',
    };
}

export function findDebugHostTask(
    tasks: readonly vscode.Task[],
    workspace: vscode.WorkspaceFolder,
    preLaunchTaskName: string | undefined,
): vscode.Task | undefined {
    return tasks.find(task => isTaskInWorkspace(task, workspace) &&
        (preLaunchTaskName ? task.name === preLaunchTaskName : isFuncHostTask(task)));
}

function isTaskInWorkspace(task: vscode.Task, workspace: vscode.WorkspaceFolder): boolean {
    const scope = task.scope;
    return scope === workspace ||
        typeof scope === 'object' && scope.uri.toString() === workspace.uri.toString();
}

/**
 * Returns the deepest Functions project (folder with host.json) at or above `targetPath`, bounded by the enclosing
 * workspace folder and skipping build-output copies.
 */
export async function findProjectContainingPath(targetPath: string, workspacePath: string): Promise<string | undefined> {
    const root = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(targetPath))?.uri.fsPath ??
        (isPathWithin(workspacePath, targetPath) ? workspacePath : targetPath);
    const relativeSegments = path.relative(root, targetPath).split(path.sep).filter(Boolean);
    for (let length = relativeSegments.length; length >= 0; length--) {
        const segments = relativeSegments.slice(0, length);
        if (segments.some(segment => buildOutputSegments.has(segment.toLowerCase()))) {
            continue;
        }
        const candidate = path.join(root, ...segments);
        if (await AzExtFsExtra.pathExists(path.join(candidate, hostFileName))) {
            return candidate;
        }
    }
    return undefined;
}

function isPathWithin(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return !relative || !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function getTaskExecutionKind(task: vscode.Task): DebugHostTaskExecution {
    if (task.execution instanceof vscode.ShellExecution) {
        return 'shell';
    }
    return task.execution instanceof vscode.ProcessExecution ? 'process' : 'custom';
}

/**
 * Returns the ordered environment layers VS Code applies to a task terminal: the extension host process environment,
 * `terminal.integrated.env.<platform>`, then the task's `options.env`. Layers are kept separate so callers can detect a
 * value that a later layer overrides.
 */
export function getTaskEnvironmentLayers(
    taskEnvironment: Readonly<Record<string, string>> | undefined,
    workspace: vscode.WorkspaceFolder,
    baseEnvironment: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): EnvironmentLayer[] {
    const terminalEnvironment: Record<string, string | null> = {};
    const configured: unknown = vscode.workspace.getConfiguration('terminal.integrated.env', workspace.uri).get(getTerminalPlatformKey(platform));
    if (configured && typeof configured === 'object') {
        for (const [name, value] of Object.entries(configured as Record<string, unknown>)) {
            if (value === null) {
                terminalEnvironment[name] = null;
            } else if (typeof value === 'string') {
                // Keep unresolved variables visible as overrides rather than guessing the value the host will receive.
                terminalEnvironment[name] = resolveTaskVariables(value, workspace) ?? value;
            }
        }
    }

    const taskLayer: Record<string, string> = {};
    for (const [name, value] of Object.entries(taskEnvironment ?? {})) {
        if (typeof value === 'string') {
            taskLayer[name] = resolveTaskVariables(value, workspace) ?? value;
        }
    }

    return [{ ...baseEnvironment }, terminalEnvironment, taskLayer];
}

/**
 * Applies environment layers in order. Null deletes a name; on Windows names match case-insensitively.
 */
export function mergeEnvironmentLayers(
    layers: readonly EnvironmentLayer[],
    platform: NodeJS.Platform = process.platform,
): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const layer of layers) {
        for (const [name, value] of Object.entries(layer)) {
            if (value === undefined) {
                continue;
            }
            if (platform === 'win32') {
                for (const existing of Object.keys(environment)) {
                    if (existing.toLowerCase() === name.toLowerCase()) {
                        delete environment[existing];
                    }
                }
            } else {
                delete environment[name];
            }
            if (value !== null) {
                environment[name] = value;
            }
        }
    }
    return environment;
}

function getTerminalPlatformKey(platform: NodeJS.Platform): 'windows' | 'osx' | 'linux' {
    return platform === 'win32' ? 'windows' : platform === 'darwin' ? 'osx' : 'linux';
}

/**
 * Resolves the VS Code task variables that can be evaluated without user interaction.
 * Returns undefined when any other variable (for example `${input:...}` or `${command:...}`) remains.
 */
export function resolveTaskVariables(value: string, workspace: vscode.WorkspaceFolder): string | undefined {
    let unresolved = false;
    const result = value.replace(/\$\{([^}]+)\}/g, (match, variable: string) => {
        const resolved = resolveTaskVariable(variable, workspace);
        if (resolved === undefined) {
            unresolved = true;
            return match;
        }
        return resolved;
    });
    return unresolved ? undefined : result;
}

function resolveTaskVariable(variable: string, workspace: vscode.WorkspaceFolder): string | undefined {
    switch (variable) {
        case 'workspaceFolder':
        case 'workspaceRoot':
            return workspace.uri.fsPath;
        case 'workspaceFolderBasename':
            return path.basename(workspace.uri.fsPath);
        case 'userHome':
            return os.homedir();
        case 'pathSeparator':
        case '/':
            return path.sep;
        default:
    }

    const [prefix, ...rest] = variable.split(':');
    const argument = rest.join(':');
    if (!argument) {
        return undefined;
    }
    switch (prefix) {
        case 'workspaceFolder':
            return vscode.workspace.workspaceFolders?.find(folder => folder.name === argument)?.uri.fsPath;
        case 'env':
            return getEnvironmentValue(process.env, argument) ?? '';
        case 'config': {
            const configValue: unknown = vscode.workspace.getConfiguration(undefined, workspace.uri).get(argument);
            return typeof configValue === 'string' || typeof configValue === 'number' || typeof configValue === 'boolean'
                ? String(configValue)
                : undefined;
        }
        default:
            return undefined;
    }
}

function getEnvironmentValue(environment: NodeJS.ProcessEnv, name: string): string | undefined {
    if (environment[name] !== undefined || process.platform !== 'win32') {
        return environment[name];
    }
    const key = Object.keys(environment).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : environment[key];
}
