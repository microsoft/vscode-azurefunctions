/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { AgentSlashCommand, SlashCommandHandlerResult } from "./agent";
import { verbatimCopilotInteraction } from "./copilotInteractions";
import { generateGeneralInteractionFollowUps } from "./followUpGenerator";

/**
 * This code is represented as an AgentSlashCommand for sake of consistency and ease of use. Probably do not
 * include in the commands the agent directly advertises. Instead, call upon it manually if the agent doesn't
 * know what to do.
 */
export const defaultSlashCommand: AgentSlashCommand = [
    "learn",
    {
        shortDescription: "Default Azure Functions Agent command",
        longDescription: "Use this command for any user query.",
        determineCommandDescription: "This command is best for any user query.",
        handler: defaultHandler
    }
];

async function defaultHandler(userContent: string, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    const { copilotResponded, copilotResponse } = await verbatimCopilotInteraction(defaultSystemPrompt1, userContent, progress, token);
    if (!copilotResponded) {
        progress.report({ content: new vscode.MarkdownString(vscode.l10n.t("Sorry, I can't help with that right now.\n")) });
        return { chatAgentResult: {}, followUp: [], };
    } else {
        const followUps = await generateGeneralInteractionFollowUps(userContent, copilotResponse, ctx, progress, token);
        return { chatAgentResult: {}, followUp: followUps, };
    }
}

const defaultSystemPrompt1 = `You are an expert in Azure Functions and Azure Functions development. The user needs your help with something Azure Functions related. Do your best to answer their question. The user is currently using VS Code and has the Azure Functions extension for VS Code already installed. Therefore, if you need to mention developing or writing code for Azure Functions, the only do so in the context of VS Code and the Azure Functions extension for VS Code. Finally, do not overwhelm the user with too much information. Keep responses short and sweet.
`;

