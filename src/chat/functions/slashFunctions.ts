/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { InvokeableSlashCommands, SlashCommand, SlashCommandHandlerResult, SlashCommandOwner } from "../slashCommands";
import { brainstormSlashCommand } from "./slashBrainstorm";
import { createFunctionAppSlashCommand } from "./slashCreateFunctionApp";
import { createFunctionProjectSlashCommand } from "./slashCreateFunctionProject";
import { deploySlashCommand } from "./slashDeploy";
import { learnSlashCommand } from "./slashLearn";

export const functionsSlashCommands: InvokeableSlashCommands = new Map([
    learnSlashCommand,
    brainstormSlashCommand,
    createFunctionAppSlashCommand,
    createFunctionProjectSlashCommand,
    deploySlashCommand,
]);

export const functionsSlashCommand: SlashCommand = [
    "functions",
    {
        shortDescription: "Do something with the Azure Functions extension for VS Code",
        longDescription: "Use this command when you want to do something with the Azure Functions extension for VS Code.",
        determineCommandDescription: "This command is best when a users prompt could be related to Azure Functions or the Azure Functions extension for VS Code.",
        handler: functionsHandler,
    }
];

const functionsSlashCommandOwner = new SlashCommandOwner(functionsSlashCommands, { noInput: giveNoInputResponse, default: giveNoInputResponse });

async function functionsHandler(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    return await functionsSlashCommandOwner.handleRequestOrPrompt(userContent, _ctx, progress, token);
}

async function giveNoInputResponse(_userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, _token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    progress.report({ content: `Hi! It sounds like you might be interested in using the Azure Functions Extension for VS Code, however, I can't quite help with what you're asking about. Try asking something else.` });
    return {
        chatAgentResult: {},
        followUp: [
            { message: `@azure-extensions I want to use Azure Functions to serve dynamic content and APIs.` },
            { message: `@azure-extensions I want to use Azure Functions to run background jobs or scheduled tasks.` },
            { message: `@azure-extensions I want to use Azure Functions to process files as soon as they are uploaded.` },
        ]
    };
}
