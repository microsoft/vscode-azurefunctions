/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ext } from '../extensionVariables';
import { agentDescription, agentFullName, agentName } from "./agentConsts";
import { AgentBenchmarker } from "./benchmarking/benchmarking";
import { verbatimCopilotInteraction } from "./copilotInteractions";
import { functionsSlashCommand } from "./functions/slashFunctions";
import {
    FallbackSlashCommandHandlers,
    InvokeableSlashCommands,
    SlashCommandHandlerResult,
    SlashCommandOwner
} from "./slashCommands";

const agentSlashCommands: InvokeableSlashCommands = new Map([
    functionsSlashCommand
]);

const fallbackSlashCommandHandlers: FallbackSlashCommandHandlers = {
    noInput: noInputHandler,
    default: defaultHandler,
};
const agentSlashCommandOwner = new SlashCommandOwner(agentSlashCommands, fallbackSlashCommandHandlers);

const agentBenchmarker = new AgentBenchmarker(agentSlashCommandOwner);

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

async function handler(request: vscode.ChatAgentRequest, context: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<vscode.ChatAgentResult2 | undefined> {
    const handleResult = await agentBenchmarker.handleRequestOrPrompt(request, context, progress, token) ||
        await agentSlashCommandOwner.handleRequestOrPrompt(request, context, progress, token);

    if (handleResult !== undefined) {
        return handleResult.chatAgentResult;
    } else {
        return undefined;
    }
}

function followUpProvider(result: vscode.ChatAgentResult2, token: vscode.CancellationToken): vscode.ProviderResult<vscode.ChatAgentFollowup[]> {
    return agentBenchmarker.getFollowUpForLastHandledSlashCommand(result, token) || agentSlashCommandOwner.getFollowUpForLastHandledSlashCommand(result, token) || [];
}

function getSlashCommands(_token: vscode.CancellationToken): vscode.ProviderResult<vscode.ChatAgentSlashCommand[]> {
    return Array
        .from(agentSlashCommands.entries())
        .map(([name, config]) => ({ name: name, description: config.shortDescription }))
}

async function defaultHandler(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    const defaultSystemPrompt1 = `You are an expert in using the Azure Extensions for VS Code. The user needs your help with something related to either Azure, VS Code, and/or the Azure Extensions for VS Code. Do your best to answer their question. The user is currently using VS Code and has one or more Azure Extensions for VS Code installed. Do not overwhelm the user with too much information. Keep responses short and sweet.`;

    const { copilotResponded } = await verbatimCopilotInteraction(defaultSystemPrompt1, userContent, progress, token);
    if (!copilotResponded) {
        progress.report({ content: vscode.l10n.t("Sorry, I can't help with that right now.\n") });
        return { chatAgentResult: {}, followUp: [], };
    } else {
        return { chatAgentResult: {}, followUp: [], };
    }
}

async function noInputHandler(_userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, _token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    const slashCommandsMarkdown = Array.from(agentSlashCommands).map(([name, config]) => `- \`/${name}\` - ${config.longDescription || config.shortDescription}`).join("\n");
    progress.report({ content: `Hi! I can help you with tasks related to Azure Functions development. If you know what you'd like to do, you can use the following commands to ask me for help:\n\n${slashCommandsMarkdown}\n\nOtherwise feel free to ask or tell me anything and I'll do my best to help.` });
    return { chatAgentResult: {}, followUp: [] };
}
