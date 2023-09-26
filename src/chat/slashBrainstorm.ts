/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { AgentSlashCommand, SlashCommandHandlerResult } from "./agent";
import { verbatimCopilotInteraction } from "./copilotInteractions";
import { generateGeneralInteractionFollowUps } from "./followUpGenerator";

export const brainstormSlashCommand: AgentSlashCommand = [
    "brainstorm",
    {
        shortDescription: "Brainstorm about how you can use Azure Functions",
        longDescription: "Use this command to get help brainstorming about how you can use Azure Functions and VS Code to help you solve a problem.",
        determineCommandDescription: "This command is best when users have a question about wanting to know if or how Azure Functions can help them solve a problem, create somthing, or accomplish a task. For example, if they are saying 'how do I' or 'is it possible' or 'how can azure functions', this command is probably the best choice.",
        handler: brainstormHandler
    }
];

async function brainstormHandler(userContent: string, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    if (userContent.length === 0) {
        progress.report({ content: new vscode.MarkdownString("If you'd like to brainstorm about how you can use Azure Functions and VS Code to help you do something, let me know what it is you would like to do.\n") });
        return {
            chatAgentResult: {},
            followUp: [
                { message: `@azure-functions I want to use Azure Functions to serve dynamic content and APIs.` },
                { message: `@azure-functions I want to use Azure Functions to run background jobs or scheduled tasks.` },
                { message: `@azure-functions I want to use Azure Functions to process files as soon as they are uploaded.` },
            ],
        };
    } else {
        const { copilotResponded, copilotResponse } = await verbatimCopilotInteraction(brainstormSystemPrompt2, userContent, progress, token);
        if (!copilotResponded) {
            progress.report({ content: new vscode.MarkdownString("Sorry, I can't help with that right now.\n") });
            return { chatAgentResult: {}, followUp: [], };
        } else {
            const followUps = await generateGeneralInteractionFollowUps(userContent, copilotResponse, ctx, progress, token);
            return { chatAgentResult: {}, followUp: followUps, };
        }
    }
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const brainstormSystemPrompt1 = `
You are an expert in Azure Functions development. The user is using VS Code and the Azure Functions extension. They want to use these tools to create Azure Function Apps to help them solve a problem. Your job is to help the user brainstorm about how they can use Azure Functions, VS Code, and the Azure Functions extension to help them solve their problem. Do not suggest using any other tools other than what has been previously mentioned. Assume the the user is only interested in using cloud services from Microsoft Azure.
`;

const brainstormSystemPrompt2 = `
You are an expert in Azure Functions development. The user is using VS Code and the Azure Functions extension for VS Code. They want to use these tools to create Azure Function Apps to help them solve a problem. Your job is to help the user brainstorm about how they can use Azure Functions, VS Code, and the Azure Functions extension for VS Code to help them solve their problem. Do not suggest using any other tools other than what has been previously mentioned. Assume the the user is only interested in using cloud services from Microsoft Azure. Finally, do not overwhelm the user with too much information. Keep responses short and sweet.
`;
