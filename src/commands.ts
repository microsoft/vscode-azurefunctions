/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as opn from 'opn';
import * as path from 'path';
import * as util from './util';
import * as vscode from 'vscode';

import { INode } from './nodes';
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

export async function createFunction(functionsCli: FunctionsCli) {
    const rootPath = vscode.workspace.rootPath;
    if (!rootPath) {
        throw new util.NoWorkspaceError();
    } else {
        const missingFiles = getMissingFunctionAppFiles(rootPath);
        if (missingFiles.length !== 0) {
            const result = await vscode.window.showWarningMessage(`The current folder is not initialized as a function app. Add missing files: '${missingFiles.join("', '")}'?`, _yes, _no);
            if (result === _yes) {
                functionsCli.initFunctionApp(rootPath);
            } else {
                throw new util.UserCancelledError();
            }
        }

        const templates = [
            new QuickPickItemWithData("BlobTrigger"),
            new QuickPickItemWithData("EventGridTrigger"),
            new QuickPickItemWithData("HttpTrigger"),
            new QuickPickItemWithData("QueueTrigger"),
            new QuickPickItemWithData("TimerTrigger")
        ];
        const template = await util.showQuickPick(templates, "Select a function template");

        const name = await util.showInputBox("Function Name", "Provide a function name", (s) => validateTemplateName(rootPath, s));

        functionsCli.createFunction(rootPath, template.label, name);
    }
}

export async function initFunctionApp(functionsCli: FunctionsCli) {
    const rootPath = vscode.workspace.rootPath;
    if (!rootPath) {
        throw new util.NoWorkspaceError();
    } else {
        let result: string | undefined;
        const missingFiles = getMissingFunctionAppFiles(rootPath);
        if (missingFiles.length === 0) {
            await vscode.window.showWarningMessage("The current folder is already initialized as a function app.");
            return;
        } else if (missingFiles.length !== _expectedFunctionAppFiles.length) {
            result = await vscode.window.showWarningMessage(`The current folder is partially intialized. Add missing files: '${missingFiles.join("', '")}'?`, _yes, _no);
        } else {
            result = await vscode.window.showInformationMessage(`Initialize a function app in the current folder?`, _yes, _no);
        }

        if (result !== _yes) {
            throw new util.UserCancelledError();
        }

        functionsCli.initFunctionApp(rootPath);
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