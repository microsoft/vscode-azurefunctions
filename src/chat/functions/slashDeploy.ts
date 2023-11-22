/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { SlashCommand, SlashCommandHandlerResult } from "../slashCommands";

export const deploySlashCommand: SlashCommand = [
    "deploy",
    {
        shortDescription: "Deploy your Function project to a Function app",
        longDescription: "Use this command to deploy your Function project to a Function app.",
        determineCommandDescription: "This command is best when users explicitly want to deploy their function project to a function app.",
        handler: deployHandler
    }
];

async function deployHandler(_userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, _token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    progress.report({ content: `Ok, click 'Deploy to Function App' to begin.\n` });
    return { chatAgentResult: {}, followUp: [{ title: "Deploy to Function App", commandId: "azureFunctions.createNewProject", args: [] }], };
}
