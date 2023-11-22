/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { getResponseAsStringCopilotInteraction, getStringFieldFromCopilotResponseMaybeWithStrJson } from "../copilotInteractions";
import { generateAlternativeCreateFunctionProjectFollowUps } from "../followUpGenerator";
import { SlashCommand, SlashCommandHandlerResult } from "../slashCommands";
import { WellKnownFunctionProjectLanguage, WellKnownTemplate, getWellKnownCSharpTemplate, getWellKnownTypeScriptTemplate, isWellKnownFunctionProjectLanguage, wellKnownCSharpTemplateDisplayNames, wellKnownTypeScriptTemplateDisplayNames } from "../wellKnownThings";

export const createFunctionProjectSlashCommand: SlashCommand = [
    "createFunctionProject",
    {
        shortDescription: "Create a Function Project",
        longDescription: "Use this command to create a new Function Project. Try giving additional context such as what you want the project to do, languages you are familiar with, etc.",
        determineCommandDescription: "This command is best when users explicitly want to create a new project. They may refer to a project as 'project', 'func project', 'functions project', 'azure functions project', etc.",
        handler: createFunctionProjectHandler
    }
];

async function createFunctionProjectHandler(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    let markDownResponse: string = "";
    const followUps: vscode.InteractiveSessionFollowup[] = [];

    try {
        if (userContent.trim().length > 1) {
            const language = await determineLanguage(userContent, _ctx, progress, token);
            const template = await determineTemplate(language, userContent, _ctx, progress, token);

            if (language !== undefined && template !== undefined) {
                markDownResponse += `Ok, I can help you create a new Function Project. It sounds like using the ${language} ${template} template could be a good place to start.\n\nIf you agree, click 'Create Function Project' to begin.`;
            } else if (language !== undefined) {
                markDownResponse += `Ok, I can help you create a new Function Project. It sounds like a ${language} project would be a good fit.\n\nIf you agree, click 'Create Function Project' to begin.`;
            } else {
                markDownResponse += `Ok, I can help you create a new Function Project. click 'Create Function Project' to begin.`;
            }
            followUps.push(...(await generateAlternativeCreateFunctionProjectFollowUps(language, template)));
            followUps.push({ title: "Create Function Project", commandId: "azureFunctions.createNewProject", args: [] });
        } else {
            markDownResponse += `Ok, click 'Create Function Project' to begin. If you tell me more about what you're looking for though, I may be able to provide more help.\n`;
            followUps.push({ title: "Create Function Project", commandId: "azureFunctions.createNewProject", args: [] });
        }

    } catch (e) {
        console.log(e);
    }

    progress.report({ content: markDownResponse ?? "Sorry, I can't help with that right now.\n" });

    return { chatAgentResult: {}, followUp: followUps, };
}

/**
 * Determines what language (if any) copilot suggested for creating a function project. The language will be verified to be well known.
 */
async function determineLanguage(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<WellKnownFunctionProjectLanguage | undefined> {
    const maybeJsonCopilotResponse = await getResponseAsStringCopilotInteraction(createFunctionProjectDetermineLanguageSystemPrompt1, userContent, progress, token);
    const language = getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "language");
    if (isWellKnownFunctionProjectLanguage(language)) {
        return language;
    } else {
        return undefined;
    }
}

/**
 * Determines what template (if any) copilot suggested for creating a function project. The template will be verified to be well known for the language. If the language is not well known, then the template will be ignored.
 */
async function determineTemplate(language: WellKnownFunctionProjectLanguage | undefined, userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<WellKnownTemplate | undefined> {
    if (!isWellKnownFunctionProjectLanguage(language)) {
        language = "TypeScript";
    }

    const systemPrompt = language === "TypeScript" ?
        createFunctionProjectDetermineTemplateSystemPrompt1(wellKnownTypeScriptTemplateDisplayNames) :
        createFunctionProjectDetermineTemplateSystemPrompt1(wellKnownCSharpTemplateDisplayNames);
    const maybeJsonCopilotResponse = await getResponseAsStringCopilotInteraction(systemPrompt, userContent, progress, token);
    const copilotDeterminedTemplate = getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "template");

    const wellKnownCSharpTemplate = getWellKnownCSharpTemplate(copilotDeterminedTemplate);
    const wellKnownTypeScriptTemplate = getWellKnownTypeScriptTemplate(copilotDeterminedTemplate);
    if (language === "C#" && wellKnownCSharpTemplate !== undefined) {
        return wellKnownCSharpTemplate;
    } else if (language === "TypeScript" && wellKnownTypeScriptTemplate !== undefined) {
        return wellKnownTypeScriptTemplate;
    } else {
        return undefined;
    }
}

const createFunctionProjectDetermineLanguageSystemPrompt1 = `
You are an expert in Azure functions. The user is trying to create a new functions project. Your job is to determine the single best language for the project to use given the user's query. The available languages are: 'TypeScript' and 'C#'. Choose one of these languages as the best language. Only repsond with a JSON summary of the language you choose. Do not respond in a coverstaional tone, only JSON.

## Example 1

User: I want to create a new function project. I have experience in web development using React.JS.
Assistant: { "language": "TypeScript" }

## Example 2

User: My company is a enterprise .NET shop, but we've been wanting to try out Azure functions. Can you help me create a new function project?
Assistant: { "language": "C#" }

## Example 3

User: I want to create a new static website. Can you create a new static website project for me?
Assistant: Sorry, I don't know how to do that.
`;

const createFunctionProjectDetermineTemplateSystemPrompt1 = (availableTemplates: string[]) => `
You are an expert in Azure functions templates. The user is trying to create a new functions project. Your job is to determine the single best template given the user's query. The available templates are: ${availableTemplates.map((t) => `'${t}'`).join(",")}. Choose one of these templates as the best template. Only repsond with a JSON summary of the template you choose. Do not respond in a coverstaional tone, only JSON.

## Example 1

User: Create a functions project using the typescript blob storage trigger template
Assistant: { "template": "Azure Blob Storage trigger" }

## Example 2

User: I want to create a new function project which will let me make a function that alerts me if a blob has changed.
Assistant: { "template": "Azure Blob Storage trigger" }

## Example 3

User: I'm spinning up a new service which needs to use Azure functions to talk to a Cosmos DB resource. Can you help me create a new function project?
Assistant: { "template": "Azure Cosmos DB trigger" }

## Example 4

User: I want to create a new static website. Can you create a new static website project for me?
Assistant: Sorry, I don't know how to do that.
`;
