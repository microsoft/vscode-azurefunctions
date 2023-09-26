/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { AgentSlashCommand, SlashCommandHandlerResult } from "./agent";
import { verbatimCopilotInteraction } from "./copilotInteractions";

export const debuggingHelpSlashCommand: AgentSlashCommand = [
    "debuggingHelp",
    {
        shortDescription: "Help with local function debugging",
        longDescription: "Use this command to get help with local function debugging.",
        handler: slashDebuggingHelpHandler
    }
];

async function slashDebuggingHelpHandler(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    const { copilotResponded } = await verbatimCopilotInteraction(debuggingHelpSystemPrompt1, userContent, progress, token);
    if (!copilotResponded) {
        progress.report({ content: new vscode.MarkdownString("Sorry, I can't help with that right now.\n") });
    }
    return { chatAgentResult: {}, followUp: [], };
}

// Azure Remote Debugging is currently only supported for Node.JS Function Apps runnin on Linux App Service plans. Consumption plans are not supported.

const debuggingHelpSystemPrompt1 = `
You are an expert in Azure functions Node.JS development. The user is trying to debug a function remotely. The user is using VS Code and the Azure Functions extension. The user is getting an error when trying to debug the function remotely. Your job is to help the user resolve the error so they can debug the function remotely.
`;
