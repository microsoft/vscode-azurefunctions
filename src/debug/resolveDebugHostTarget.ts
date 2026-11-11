/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { hostFileName } from '../constants';
import { isFuncHostTask } from '../funcCoreTools/funcHostTask';

export type DebugHostTargetSource = 'task' | 'taskOutsideProject' | 'taskUnresolvedCwd' | 'workspaceDefault';

export interface DebugHostTarget {
    /**
     * Project used for pre-debug validation, or undefined when no project can be identified.
     */
    projectPath: string | undefined;
    /**
     * Complete effective environment of the selected host task, when that task was found.
     */
    environment?: Readonly<Record<string, string | undefined>>;
    /**
     * False when the selected host task is known not to run `projectPath`, so project-specific Azure setup must not run.
     */
    hostTaskTargetsProject: boolean;
    source: DebugHostTargetSource;
}

type TaskExecutionWithOptions = { options?: { cwd?: string; env?: Record<string, string> } };

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
    const environment = getEffectiveTaskEnvironment(options?.env, workspace);
    const cwd = resolveTaskVariables(options?.cwd ?? workspace.uri.fsPath, workspace);
    if (cwd === undefined) {
        return {
            projectPath: await tryGetFunctionProjectRoot(context, workspace, 'silent'),
            environment,
            hostTaskTargetsProject: false,
            source: 'taskUnresolvedCwd',
        };
    }

    const projectPath = await findProjectContainingPath(path.resolve(workspace.uri.fsPath, cwd), workspace.uri.fsPath);
    if (projectPath) {
        return { projectPath, environment, hostTaskTargetsProject: true, source: 'task' };
    }

    // Preserve the historical non-prompting project choice for generic validation, but never treat it as the host's project.
    return {
        projectPath: await tryGetFunctionProjectRoot(context, workspace, 'silent'),
        environment,
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

export function getEffectiveTaskEnvironment(
    taskEnvironment: Readonly<Record<string, string>> | undefined,
    workspace: vscode.WorkspaceFolder,
    baseEnvironment: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
    const environment: Record<string, string | undefined> = { ...baseEnvironment };
    for (const [name, value] of Object.entries(taskEnvironment ?? {})) {
        if (process.platform === 'win32') {
            // Windows environment names are case-insensitive, so a task value replaces any differently cased inherited name.
            for (const existing of Object.keys(environment)) {
                if (existing.toLowerCase() === name.toLowerCase()) {
                    delete environment[existing];
                }
            }
        }
        // Keep unresolved variables visible as overrides rather than guessing the value the host will receive.
        environment[name] = typeof value === 'string' ? resolveTaskVariables(value, workspace) ?? value : value;
    }
    return environment;
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
