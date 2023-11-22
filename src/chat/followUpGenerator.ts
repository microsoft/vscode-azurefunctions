/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { agentName } from "./agentConsts";
import { getResponseAsStringCopilotInteraction, getStringFieldFromCopilotResponseMaybeWithStrJson } from "./copilotInteractions";
import { WellKnownFunctionProjectLanguage, WellKnownTemplate, getWellKnownCSharpTemplate, getWellKnownTypeScriptTemplate, isWellKnownFunctionProjectLanguage, wellKnownCSharpTemplateDisplayNames, wellKnownTypeScriptTemplateDisplayNames } from "./wellKnownThings";

/**
 * Generates all types of follow ups for the given copilot response. This currently includes:
 * - Creating a function project
 *
 * Todo:
 * - Deploying a function project
 * - Creating a function app
 */
export async function generateGeneralInteractionFollowUps(userContent: string, copilotContent: string, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<vscode.InteractiveSessionReplyFollowup[]> {
    try {
        const nextQuestionFollowUpsPromise = generateNextQuestionsFollowUps(userContent, copilotContent, ctx, progress, token);
        const createFunctionProjectFollowUpsPromise = generateCreateFunctionProjectFollowUps(userContent, copilotContent, ctx, progress, token);

        return [
            ...await createFunctionProjectFollowUpsPromise,
            ...(await nextQuestionFollowUpsPromise).slice(0, 2),
        ];
    } catch (e) {
        console.log(e);
        return [];
    }
}

/**
 * Given a function project language and a template for that language, attempts to generate follow ups that use similar templates for other languages.
 */
export async function generateAlternativeCreateFunctionProjectFollowUps(language?: WellKnownFunctionProjectLanguage, template?: WellKnownTemplate): Promise<vscode.InteractiveSessionReplyFollowup[]> {
    const result: vscode.InteractiveSessionReplyFollowup[] = [];
    if (language !== undefined && template !== undefined) {
        if (language === "C#" && getWellKnownTypeScriptTemplate(template)) {
            result.push({ message: `@${agentName} create a project using the TypeScript ${template} template` });
        }
        if (language === "TypeScript" && getWellKnownCSharpTemplate(template)) {
            result.push({ message: `@${agentName} create a project using the C# ${template} template` });
        }
    }
    return result;
}

async function generateCreateFunctionProjectFollowUps(userContent: string, copilotContent: string, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<vscode.InteractiveSessionReplyFollowup[]> {
    const createFunctionProjectFollowUps: vscode.InteractiveSessionReplyFollowup[] = [];
    const functionProjectionSuggestion = await wasCreatingFunctionProjectSuggested(userContent, copilotContent, ctx, progress, token);
    if (functionProjectionSuggestion !== false) {
        if (functionProjectionSuggestion.language !== undefined && functionProjectionSuggestion.template !== undefined) {
            createFunctionProjectFollowUps.push({ message: `@${agentName} create a function project using the ${functionProjectionSuggestion.language} ${functionProjectionSuggestion.template} template` });
        } else if (functionProjectionSuggestion.language !== undefined) {
            createFunctionProjectFollowUps.push({ message: `@${agentName} create a ${functionProjectionSuggestion.language} function project` });
        } else if (functionProjectionSuggestion.template !== undefined) {
            if (getWellKnownCSharpTemplate(functionProjectionSuggestion.template)) {
                createFunctionProjectFollowUps.push({ message: `@${agentName} create a function project using the C# ${functionProjectionSuggestion.template} template` });
            }
            if (getWellKnownTypeScriptTemplate(functionProjectionSuggestion.template)) {
                createFunctionProjectFollowUps.push({ message: `@${agentName} create a function project using the TypeScript ${functionProjectionSuggestion.template} template` });
            }
        }
    }
    return createFunctionProjectFollowUps;
}

export async function generateNextQuestionsFollowUps(_userContent: string, copilotContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<vscode.InteractiveSessionReplyFollowup[]> {
    const maybeJsonCopilotResponseLanguage = await getResponseAsStringCopilotInteraction(generateNextQuestionsFollowUpsSystemPrompt1, copilotContent, progress, token);
    const copilotGeneratedFollowUpQuestions = [
        getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponseLanguage, "followUpOne")?.trim(),
        getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponseLanguage, "followUpTwo")?.trim(),
        getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponseLanguage, "followUpThree")?.trim(),
    ];
    return copilotGeneratedFollowUpQuestions
        .map((q) => {
            if (q !== undefined && q !== "") {
                return { message: `@${agentName} ${q}` };
            } else {
                return undefined;
            }
        })
        .filter((q): q is vscode.InteractiveSessionReplyFollowup => q !== undefined);
}

/**
 * Given a copilot response, determines if the response suggests creating a function project. If so, returns the language and template suggested for the project. If not, returns false.
 */
async function wasCreatingFunctionProjectSuggested(userContent: string, copilotContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<false | { language: WellKnownFunctionProjectLanguage | undefined, template: WellKnownTemplate | undefined }> {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/no-explicit-any, no-async-promise-executor
    const copilotDeterminedLanguageFromUserContent = await new Promise<string | undefined>(async (resolve) => {
        const maybeJsonCopilotResponseLanguage = await getResponseAsStringCopilotInteraction(determineBestLanguageForUserSystemPrompt1, userContent, progress, token);
        resolve(getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponseLanguage, "language"));
    });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/no-explicit-any, no-async-promise-executor
    const copilotDeterminedLanguageFromCopilotContent = await new Promise<string | undefined>(async (resolve) => {
        const maybeJsonCopilotResponseLanguage = await getResponseAsStringCopilotInteraction(wasCreatingFunctionProjectSuggestedInferLanguageSystemPrompt1, copilotContent, progress, token);
        resolve(getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponseLanguage, "language"));
    });
    const copilotDeterminedTemplate =
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/no-explicit-any, no-async-promise-executor
        (await new Promise<string | undefined>(async (resolve) => {
            const maybeJsonCopilotResponseLanguage = await getResponseAsStringCopilotInteraction(wasCreatingFunctionProjectSuggestedInferTemplateSystemPrompt2(wellKnownTypeScriptTemplateDisplayNames), copilotContent, progress, token);
            resolve(getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponseLanguage, "template"));
        }))
        ??
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/no-explicit-any, no-async-promise-executor
        (await new Promise<string | undefined>(async (resolve) => {
            const maybeJsonCopilotResponseLanguage = await getResponseAsStringCopilotInteraction(wasCreatingFunctionProjectSuggestedInferTemplateSystemPrompt2(wellKnownCSharpTemplateDisplayNames), copilotContent, progress, token);
            resolve(getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponseLanguage, "template"));
        }));


    if (copilotDeterminedLanguageFromUserContent === undefined && copilotDeterminedLanguageFromCopilotContent === undefined && copilotDeterminedTemplate === undefined) {
        return false;
    }

    let languageToUse: WellKnownFunctionProjectLanguage | undefined = undefined;
    if (isWellKnownFunctionProjectLanguage(copilotDeterminedLanguageFromUserContent)) {
        languageToUse = copilotDeterminedLanguageFromUserContent;
    } else if (isWellKnownFunctionProjectLanguage(copilotDeterminedLanguageFromCopilotContent)) {
        languageToUse = copilotDeterminedLanguageFromCopilotContent;
    }

    const wellKnownCSharpTemplate = getWellKnownCSharpTemplate(copilotDeterminedTemplate);
    const wellKnownTypeScriptTemplate = getWellKnownTypeScriptTemplate(copilotDeterminedTemplate);
    if (languageToUse) {
        if (languageToUse === "C#" && wellKnownCSharpTemplate !== undefined) {
            return { language: languageToUse, template: wellKnownCSharpTemplate };
        } else if (languageToUse === "TypeScript" && wellKnownTypeScriptTemplate !== undefined) {
            return { language: languageToUse, template: wellKnownTypeScriptTemplate };
        }
    }

    if (wellKnownCSharpTemplate !== undefined || wellKnownTypeScriptTemplate !== undefined) {
        return { language: undefined, template: wellKnownCSharpTemplate ?? wellKnownTypeScriptTemplate };
    }

    if (languageToUse !== undefined) {
        return { language: languageToUse, template: undefined };
    }

    return false;
}

const determineBestLanguageForUserSystemPrompt1 = `You are an expert in all things programming. Your job is to determine what language the user might be most familiar with given the user's query. The available languages are: 'TypeScript' and 'C#'. Choose one of these languages as the best language. If you cannot determine a language, you can reply with 'unknown'. Only repsond with a JSON summary of the language you choose. Do not respond in a coverstaional tone, only JSON.

# Example 1

User: I want to create a new function project. I have experience in web development using React.JS.
Assistant: { "language": "TypeScript" }

# Example 2

User: My company is a enterprise .NET shop, but we've been wanting to try out Azure functions. Can you help me create a new function project?
Assistant: { "language": "C#" }

# Example 3

User: I want to create a new function project.
Assistant: { "language": "unknown" }
`;

const wasCreatingFunctionProjectSuggestedInferLanguageSystemPrompt1 = `You are an expert in Azure Functions development. Your job is to determine if the given text suggests doing something which could be accomplished by creating a functions project, and if so what language would be best for the such a project or the user. The available languages are TypeScript or C#. Only repsond with a JSON summary of the chosen language. Do not respond in a coverstaional tone, only JSON. If the text did not suggest doing something which could be accomplished by creating a functions project, respond with an empty JSON object. If the text did suggest doing something which could be accomplished by creating a functions project, but you could not determine a language, than use the value "unknown" for its JSON field.

# Example 1

Text: For the problem you're asking about, you could create an Azure Functions project.
Result: { "language": "unknown" }

# Example 2

Text: You could base your project off of the Azure Functions extension TypeScript Blob Storage Trigger template.
Result: { "language": "TypeScript" }

# Example 3

Text: For the problem you're asking about, you could create a C# Azure Functions project.
Result: { "language": "C#" }

# Example 4

Text: You will then want to deploy your project to an Azure Function App resource.
Result: { }

# Example 5

Text: You could base your project off of the Azure Functions extension C# queue trigger template.
Result: { "language": "C#" }
`;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const wasCreatingFunctionProjectSuggestedInferTemplateSystemPrompt1 = (availableTemplates: string[]) => `You are an expert in Azure Functions development. Your job is to determine if the given text suggests doing something which could be accomplished by creating a functions project, and if so what template would be best for the such a project. The available templates are: ${availableTemplates.map((t) => `'${t}'`).join(",")}. Choose one of these templates as the best template. Only repsond with a JSON summary of the chosen template. Do not respond in a coverstaional tone, only JSON. If the text did not suggest doing something which could be accomplished by creating a functions project, respond with an empty JSON object. If the text did suggest doing something which could be accomplished by creating a functions project, but you could not determine a template, than use the value "unknown" for its JSON field.

# Example 1

Text: For the problem you're asking about, you could create an Azure Functions project.
Result: { "template": "unknown" }

# Example 2

Text: You could base your project off of the Azure Functions extension TypeScript Blob Storage Trigger template.
Result: { "template": "AzureBlobStorageTrigger" }

# Example 3

Text: For the problem you're asking about, you could create a C# Azure Functions project.
Result: { "template": "unknown" }

# Example 4

Text: You will then want to deploy your project to an Azure Function App resource.
Result: { }

# Example 5

Text: You could base your project off of the Azure Functions extension C# queue trigger template.
Result: { "template": "AzureQueueStorageTrigger" }
`;

const wasCreatingFunctionProjectSuggestedInferTemplateSystemPrompt2 = (availableTemplates: string[]) => `You are an expert in Azure Functions development. Your job is to choose which of the available templates is most related to the given text. The available templates are: ${availableTemplates.map((t) => `'${t}'`).join(",")}. Only repsond with a JSON summary of the chosen template. Do not respond in a coverstaional tone, only JSON. If none of the templates are related to the given text, respond with an empty JSON object.

# Example 1

Text: For the problem you're asking about, you could create an Azure Functions project.
Result: { "template": "unknown" }

# Example 2

Text: You could base your project off of the Azure Functions extension TypeScript Blob Storage Trigger template.
Result: { "template": "AzureBlobStorageTrigger" }

# Example 3

Text: For the problem you're asking about, you could create a C# Azure Functions project.
Result: { "template": "unknown" }

# Example 4

Text: You will then want to deploy your project to an Azure Function App resource.
Result: { }

# Example 5

Text: You could base your project off of the Azure Functions extension C# queue trigger template.
Result: { "template": "AzureQueueStorageTrigger" }
`;

const generateNextQuestionsFollowUpsSystemPrompt1 = `You are an expert in Azure Functions development. Your job is to come up with follow up questions a user might have given the following information. Think about what the user might want to do next, or what they might want to know more about. Only focus on topics related to Azure Functions. Suggest a up to three follow up questions. Only repsond with a JSON summary of the follow up questions. Do not respond in a coverstaional tone, only JSON.

# Example 1

Text: You can create an Azure Function using the HTTP Trigger template in the VS Code Azure Functions extension to serve dynamic content and APIs. You can write code to generate the dynamic content and responses to incoming requests, and deploy your Azure Function as an HTTP endpoint. You can also configure your Function App to automatically scale and handle high traffic loads as needed.
Result: { "followUpOne": "How can I configure my Function App to automatically scale?" }

# Example 2
Text: You can create an Azure Function using the Blob Storage Trigger template in the VS Code Azure Functions extension to process files as soon as they are uploaded. You can write code to process the files, and deploy your Azure Function to your Azure subscription.
Result: { "followUpOne": "Can a blob storage trigger template be configured to trigger if any blobs under a prefix are changed?", "followUpTwo": "Can an Azure Function be triggered by changes in an Azure file share?" }

# Example 3
Text: You can create an Azure Function using the Event Grid Trigger template in the VS Code Azure Functions extension to process events from Azure Event Grid.
Result: { "followUpOne": "What other Azure services can Azure Functions be triggered by?", "followUpTwo": "What Azure services integrate well with Azure Functions?", "followUpThree": "What types of event processing can Azure Functions help with?" }
`
