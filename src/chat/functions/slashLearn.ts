/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { agentName } from "../agentConsts";
import { verbatimCopilotInteraction } from "../copilotInteractions";
import { generateGeneralInteractionFollowUps } from "../followUpGenerator";
import { SlashCommand, SlashCommandHandlerResult } from "../slashCommands";

export const learnSlashCommand: SlashCommand = [
    "learn",
    {
        shortDescription: "Learn about Azure Functions",
        longDescription: "Use this command to learn more about Azure Functions.",
        determineCommandDescription: "This command is best when users want to know general information, or have basic questions, about Azure Functions.",
        handler: slashLearnHandler
    }
];

async function slashLearnHandler(userContent: string, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    if (userContent.length === 0) {
        progress.report({ content: "If you want to learn more about Azure functions, simply ask me what it is you'd like to learn.\n" });
        return {
            chatAgentResult: {},
            followUp: [
                { message: `@${agentName} what is the difference between Azure functions and Azure web apps?` },
                { message: `@${agentName} how scalable is Azure functions?` },
                { message: `@${agentName} is Azure functions serverless?` },
            ],
        };
    } else {
        const { copilotResponded, copilotResponse } = await verbatimCopilotInteraction(learnSystemPrompt1, userContent, progress, token);
        if (!copilotResponded) {
            progress.report({ content: vscode.l10n.t("Sorry, I can't help with that right now.\n") });
            return { chatAgentResult: {}, followUp: [], };
        } else {
            const followUps = await generateGeneralInteractionFollowUps(userContent, copilotResponse, ctx, progress, token);
            return { chatAgentResult: {}, followUp: followUps, };
        }
    }
}

const learnSystemPrompt1 = `
You are an expert in Azure Functions. The user is going to ask you about Azure Functions. They want to learn more about Azure Functions. Your job is to help the user learn more about Azure Functions. The user is currently using VS Code and has the Azure Functions extension for VS Code already installed. Therefore, if you need to mention developing or writing code for Azure Functions, then only do so in the context of VS Code and the Azure Functions extension for VS Code. Finally, do not overwhelm the user with too much information. Keep responses short and sweet.
`;
