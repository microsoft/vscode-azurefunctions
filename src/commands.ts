/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as opn from 'opn';
import * as path from 'path';
import * as util from './util';
import * as vscode from 'vscode';

import { INode, FunctionAppNode } from './nodes';
import { FunctionsCli } from './functions-cli';
import { QuickPickItemWithData } from './util';

const _expectedFunctionAppFiles = [
    "host.json",
    "local.settings.json",
    path.join(".vscode", "launch.json")
];
const _yes = "Yes";
const _no = "No";

export function openInPortal(node?: INode) {
    if (node && node.tenantId) {
        opn(`https://portal.azure.com/${node.tenantId}/#resource${node.id}`);
    }
}

export async function createFunction(outputChannel: vscode.OutputChannel, functionsCli: FunctionsCli) {
    const rootPath = vscode.workspace.rootPath;
    if (!rootPath) {
        throw new util.NoWorkspaceError();
    } else {
        const missingFiles = getMissingFunctionAppFiles(rootPath);
        if (missingFiles.length !== 0) {
            const result = await vscode.window.showWarningMessage(`The current folder is not initialized as a function app. Add missing files: '${missingFiles.join("', '")}'?`, _yes, _no);
            if (result === _yes) {
                await functionsCli.initFunctionApp(outputChannel, rootPath);
            } else {
                throw new util.UserCancelledError();
            }
        }

        // TODO: Run 'func templates list' to dynamically retrieve this list
        // Ideally the 'func' cli makes their output more pipe-able first
        const templates = [
            new QuickPickItemWithData("BlobTrigger"),
            new QuickPickItemWithData("HttpTrigger"),
            new QuickPickItemWithData("QueueTrigger"),
            new QuickPickItemWithData("TimerTrigger")
        ];
        const template = await util.showQuickPick(templates, "Select a function template");

        const name = await util.showInputBox("Function Name", "Provide a function name", (s) => validateTemplateName(rootPath, s));

        await functionsCli.createFunction(outputChannel, rootPath, template.label, name);
        const newFileUri = vscode.Uri.file(path.join(rootPath, name, "index.js"));
        vscode.window.showTextDocument(await vscode.workspace.openTextDocument(newFileUri));
    }
}

export async function initFunctionApp(outputChannel: vscode.OutputChannel, functionsCli: FunctionsCli) {
    const rootPath = vscode.workspace.rootPath;
    let functionAppPath: string | undefined;

    if (rootPath) {
        const newFolder = "New Folder";
        const result = await vscode.window.showInformationMessage(`Initialize a function app in the current folder?`, _yes, newFolder);
        if (result === _yes) {
            functionAppPath = rootPath;
        } else if (!result) {
            throw new util.UserCancelledError();
        }
    }

    if (!functionAppPath) {
        const defaultUri = rootPath ? vscode.Uri.file(rootPath) : undefined;
        const options: vscode.OpenDialogOptions = {
            defaultUri: defaultUri,
            openFolders: true,
            openMany: false,
            filters: {},
            openLabel: "Select"
        };
        const resultUri = await vscode.window.showOpenDialog(options);
        if (!resultUri || resultUri.length === 0) {
            throw new util.UserCancelledError();
        } else {
            functionAppPath = resultUri[0].fsPath;
            // TODO: Open new folder in workspace and verify behavior of multiple workspaces open at a time
        }
    }

    const tasksJsonPath = path.join(functionAppPath, ".vscode", "tasks.json");
    const tasksJsonExists = await fs.existsSync(tasksJsonPath);
    const launchJsonPath = path.join(functionAppPath, ".vscode", "launch.json");
    const launchJsonExists = await fs.existsSync(launchJsonPath);

    // TODO: Handle folders that are already initialized
    await functionsCli.initFunctionApp(outputChannel, functionAppPath);
    const newFileUri = vscode.Uri.file(path.join(functionAppPath, "local.settings.json"));
    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(newFileUri));

    if (!tasksJsonExists && !launchJsonExists) {
        const taskName = "Launch Function App";
        const tasksJson = {
            version: "2.0.0",
            tasks: [
                {
                    taskName: taskName,
                    type: "shell",
                    command: "func host start",
                    group: "none",
                    presentation: {
                        reveal: "always",
                        panel: "dedicated"
                    },
                    isBackground: true
                }
            ]
        };
        await util.writeToFile(tasksJsonPath, JSON.stringify(tasksJson, null, "    "));

        // TODO: Fix bug on first F5 (it tries to attach before 'func host start' is ready)
        const launchJson = {
            version: "0.2.0",
            configurations: [
                {
                    name: "Attach to Azure Functions",
                    type: "node",
                    request: "attach",
                    port: 5858,
                    preLaunchTask: taskName
                }
            ]
        };
        await util.writeToFile(launchJsonPath, JSON.stringify(launchJson, null, "    "));
    }
}

export async function startFunctionApp(outputChannel: vscode.OutputChannel, node?: FunctionAppNode) {
    if (node) {
        outputChannel.appendLine(`Starting Function App "${node.label}"...`);
        await node.start();
        outputChannel.appendLine(`Function App "${node.label}" has been started.`);
    }
}

export async function stopFunctionApp(outputChannel: vscode.OutputChannel, node?: FunctionAppNode) {
    if (node) {
        outputChannel.appendLine(`Stopping Function App "${node.label}"...`);
        await node.stop();
        outputChannel.appendLine(`Function App "${node.label}" has been stopped.`);
    }
}

export async function restartFunctionApp(outputChannel: vscode.OutputChannel, node?: FunctionAppNode) {
    if (node) {
        outputChannel.appendLine(`Restarting Function App "${node.label}"...`);
        await node.restart();
        outputChannel.appendLine(`Function App "${node.label}" has been restarted.`);
    }
}

function getMissingFunctionAppFiles(rootPath: string) {
    return _expectedFunctionAppFiles.filter(file => !fs.existsSync(path.join(rootPath, file)));
}

function validateTemplateName(rootPath: string, name: string): string | undefined {
    if (!name) {
        return "The template name cannot be empty."
    } else if (fs.existsSync(path.join(rootPath, name))) {
        return `A folder with the name "${name}" already exists.`;
    }
}