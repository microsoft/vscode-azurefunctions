/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as opn from 'opn';
import * as util from './util';
import { INode } from './nodes';
import { FunctionsCli } from './functions-cli';
import { QuickPickItemWithData } from './util';

export function openInPortal(node?: INode) {
    if (node && node.tenantId) {
        opn(`https://portal.azure.com/${node.tenantId}/#resource${node.id}`);
    }
}

export async function createFunction(functionsCli: FunctionsCli) {
    const templates = [
        new QuickPickItemWithData("BlobTrigger"),
        new QuickPickItemWithData("EventGridTrigger"),
        new QuickPickItemWithData("HttpTrigger"),
        new QuickPickItemWithData("QueueTrigger"),
        new QuickPickItemWithData("TimerTrigger")
    ];
    const template = await util.showQuickPick(templates, "Select a function template");

    const name = await util.showInputBox("Function Name", "Provide a function name");

    functionsCli.createFunction(template.label, name);
}

export async function initFunctionApp(functionsCli: FunctionsCli) {
    functionsCli.initFunctionApp("TODO");
}