/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ext } from '../extensionVariables';
import { getResponseAsStringCopilotInteraction, getStringFieldFromCopilotResponseMaybeWithStrJson } from "./copilotInteractions";
import { brainstormSlashCommand } from "./slashBrainstorm";
import { createFunctionAppSlashCommand } from "./slashCreateFunctionApp";
import { createFunctionProjectSlashCommand } from "./slashCreateFunctionProject";
import { defaultSlashCommand } from "./slashDefault";
import { deploySlashCommand } from "./slashDeploy";
import { learnSlashCommand } from "./slashLearn";

export type SlashCommandName = string;
export type SlashCommandHandlerResult = { chatAgentResult: vscode.ChatAgentResult2, followUp?: vscode.ChatAgentFollowup[] };
export type SlashCommandHandler = (userContent: string, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken) => Promise<SlashCommandHandlerResult>;
export type SlashCommandConfig = { shortDescription: string, longDescription: string, determineCommandDescription?: string, handler: SlashCommandHandler };
export type AgentSlashCommand = [SlashCommandName, SlashCommandConfig]

const agentName = "azure-functions";
const agentFullName = "Azure Functions Extension";
const agentDescription = "Agent for Azure Functions development";

export const slashCommands = new Map([
    learnSlashCommand,
    brainstormSlashCommand,
    createFunctionAppSlashCommand,
    createFunctionProjectSlashCommand,
    deploySlashCommand,
    // debuggingHelpSlashCommand,
]);

const slashCommandsMarkdown = Array.from(slashCommands).map(([name, config]) => `- \`/${name}\` - ${config.longDescription || config.shortDescription}`).join("\n");

let previousSlashCommandHandlerResult: SlashCommandHandlerResult | undefined;

export function registerAgent() {
    try {
        const agent2 = vscode.chat.createChatAgent(agentName, handler);
        agent2.description = agentDescription;
        agent2.fullName = agentFullName;
        agent2.iconPath = vscode.Uri.joinPath(ext.context.extensionUri, "resources", "azure-functions.svg");
        agent2.slashCommandProvider = { provideSlashCommands: getSlashCommands };
        agent2.followupProvider = { provideFollowups: followUpProvider };
    } catch (e) {
        console.log(e);
    }
}

async function handler(request: vscode.ChatAgentRequest, context: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<vscode.ProviderResult<vscode.ChatAgentResult2>> {
    const prompt = request.prompt.trim();
    const command = request.slashCommand?.name;

    let handler: SlashCommandHandler | undefined;

    if (!handler && prompt === "" && !command) {
        handler = giveNoInputResponse;
    }

    if (!handler) {
        const slashCommand = slashCommands.get(command || "");
        if (slashCommand !== undefined) {
            handler = slashCommand.handler;
        }
    }

    if (!handler) {
        const maybeCommand = await determineCommand(prompt, context, progress, token);
        if (maybeCommand !== undefined) {
            const slashCommand = slashCommands.get(maybeCommand);
            if (slashCommand !== undefined) {
                handler = slashCommand.handler;
            }
        }
    }

    if (!handler) {
        handler = defaultSlashCommand[1].handler;
    }

    previousSlashCommandHandlerResult = await handler(prompt, context, progress, token);
    return previousSlashCommandHandlerResult.chatAgentResult;
}

function followUpProvider(result: vscode.ChatAgentResult2, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.ChatAgentFollowup[]> {
    if (result === previousSlashCommandHandlerResult?.chatAgentResult) {
        return previousSlashCommandHandlerResult?.followUp || [];
    } else {
        return [];
    }
}

function getSlashCommands(_token: vscode.CancellationToken): vscode.ProviderResult<vscode.ChatAgentSlashCommand[]> {
    return Array.from(slashCommands.entries()).map(([name, config]) => {
        return { name: name, description: config.shortDescription };
    });
}

async function giveNoInputResponse(_userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, _token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    progress.report({ content: new vscode.MarkdownString(`Hi! I can help you with tasks related to Azure Functions development. If you know what you'd like to do, you can use the following commands to ask me for help:\n\n${slashCommandsMarkdown}\n\nOtherwise feel free to ask or tell me anything and I'll do my best to help.`) });
    return { chatAgentResult: {}, followUp: [] };
}

async function determineCommand(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<string | undefined> {
    const availableCommandsJoined = Array.from(slashCommands.entries()).map(([name, config]) => `'${name}' (${config.determineCommandDescription || config.longDescription})`).join(", ")
    const maybeJsonCopilotResponse = await getResponseAsStringCopilotInteraction(determineCommandSystemPrompt1(availableCommandsJoined), userContent, progress, token);
    return getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "command");
}

const determineCommandSystemPrompt1 = (availableCommandsJoined) => `
    You are an expert in Azure function development. You have several commands users can use to interact with you. The available commands are: ${availableCommandsJoined}. Your job is to determine which command would most help the user based on their query. Choose one of the available commands as the best command. Only repsond with a JSON object containing the command you choose. Do not respond in a coverstaional tone, only JSON.
`;
