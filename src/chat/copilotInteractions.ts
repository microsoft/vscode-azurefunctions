/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

const maxCachedAccessAge = 1000 * 30;
let cachedAccess: { access: vscode.ChatAccess, requestedAt: number } | undefined;
async function getChatAccess(): Promise<vscode.ChatAccess> {
    if (cachedAccess === undefined || cachedAccess.access.isRevoked || cachedAccess.requestedAt < Date.now() - maxCachedAccessAge) {
        const newAccess = await vscode.chat.requestChatAccess("copilot");
        cachedAccess = { access: newAccess, requestedAt: Date.now() };
    }
    return cachedAccess.access;
}

const showDebugCopilotInteractionAsProgress = false;
function debugCopilotInteraction(progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, msg: string) {
    if (showDebugCopilotInteractionAsProgress) {
        progress.report({ content: `\n\n${new Date().toISOString()} >> \`${msg.replace(/\n/g, "").trim()}\`\n\n` });
    }
    console.log(`${new Date().toISOString()} >> \`${msg.replace(/\n/g, "").trim()}\``);
}

/**
 * Feeds {@link systemPrompt} and {@link userContent} to Copilot and redirects the response directly to ${@link progress}.
 */
export async function verbatimCopilotInteraction(systemPrompt: string, userContent: string, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<{ copilotResponded: boolean, copilotResponse: string }> {
    let joinedFragements = "";
    await queueCopilotInteraction((fragment) => {
        joinedFragements += fragment;
        progress.report({ content: fragment });
    }, systemPrompt, userContent, progress, token);
    return { copilotResponded: true, copilotResponse: joinedFragements };
}

/**
 * Feeds {@link systemPrompt} and {@link userContent} to Copilot and directly returns its response.
 */
export async function getResponseAsStringCopilotInteraction(systemPrompt: string, userContent: string, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<string | undefined> {
    let joinedFragements = "";
    await queueCopilotInteraction((fragment) => {
        joinedFragements += fragment;
    }, systemPrompt, userContent, progress, token);
    return joinedFragements;
}

let copilotInteractionQueueRunning = false;
type CopilotInteractionQueueItem = { onResponseFragment: (fragment: string) => void, systemPrompt: string, userContent: string, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken, resolve: () => void };
const copilotInteractionQueue: CopilotInteractionQueueItem[] = [];

export async function queueCopilotInteraction(onResponseFragment: (fragment: string) => void, systemPrompt: string, userContent: string, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<void> {
    return new Promise<void>((resolve) => {
        copilotInteractionQueue.push({ onResponseFragment, systemPrompt, userContent, progress, token, resolve });
        if (!copilotInteractionQueueRunning) {
            copilotInteractionQueueRunning = true;
            void runCopilotInteractionQueue();
        }
    });
}

let lastCopilotInteractionRunTime: number = 0;
const timeBetweenCopilotInteractions = 1500
async function runCopilotInteractionQueue() {
    while (copilotInteractionQueue.length > 0) {
        const queueItem = copilotInteractionQueue.shift();
        if (queueItem === undefined) {
            continue;
        }

        const timeSinceLastCopilotInteraction = Date.now() - lastCopilotInteractionRunTime;
        if (timeSinceLastCopilotInteraction < timeBetweenCopilotInteractions) {
            await new Promise((resolve) => setTimeout(resolve, timeBetweenCopilotInteractions - timeSinceLastCopilotInteraction));
        }

        lastCopilotInteractionRunTime = Date.now();

        await doCopilotInteraction(queueItem.onResponseFragment, queueItem.systemPrompt, queueItem.userContent, queueItem.progress, queueItem.token);
        queueItem.resolve();
    }
    copilotInteractionQueueRunning = false;
}

async function doCopilotInteraction(onResponseFragment: (fragment: string) => void, systemPrompt: string, userContent: string, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<void> {
    try {
        const access = await getChatAccess();
        const messages = [
            {
                role: vscode.ChatMessageRole.System,
                content: systemPrompt
            },
            {
                role: vscode.ChatMessageRole.User,
                content: userContent
            },
        ];

        const request = access.makeRequest(messages, {}, token);
        for await (const fragment of request.response) {
            onResponseFragment(fragment);
        }
    } catch (e) {
        debugCopilotInteraction(progress, `Error: ${e}`);
    }
}

/**
 * Gets a string field from a Copilot response that may contain a stringified JSON object.
 * @param copilotResponseMaybeWithStrJson The Copilot response that might contain a stringified JSON object.
 * @param fieldName The name of the field to get from the stringified JSON object. Will first look for fields that are an exact match, then will look for fields that contain the {@link fieldName}.
 * @param filter An optional list of strings to filter contains-matches by if there are multiple fields that contain the {@link fieldName}.
 */
export function getStringFieldFromCopilotResponseMaybeWithStrJson(copilotResponseMaybeWithStrJson: string | undefined, fieldName: string, filter?: string[]): string | undefined {
    if (copilotResponseMaybeWithStrJson === undefined) {
        return undefined;
    }

    try {
        const parsedCopilotResponse = parseCopilotResponseMaybeWithStrJson(copilotResponseMaybeWithStrJson);
        return findPossibleValuesOfFieldFromParsedCopilotResponse(parsedCopilotResponse, fieldName, filter)
            .find((value): value is string => value !== undefined && value !== "" && typeof value === "string");
    } catch (e) {
        console.log(e);
        return undefined;
    }
}

/**
 * Gets a boolean field from a Copilot response that may contain a stringified JSON object.
 * @param copilotResponseMaybeWithStrJson The Copilot response that might contain a stringified JSON object.
 * @param fieldName The name of the field to get from the stringified JSON object. Will first look for fields that are an exact match, then will look for fields that contain the {@link fieldName}.
 * @param filter An optional list of strings to filter contains-matches by if there are multiple fields that contain the {@link fieldName}.
 */
export function getBooleanFieldFromCopilotResponseMaybeWithStrJson(copilotResponseMaybeWithStrJson: string | undefined, fieldName: string, filter?: string[]): boolean | undefined {
    if (copilotResponseMaybeWithStrJson === undefined) {
        return undefined;
    }

    try {
        const parsedCopilotResponse = parseCopilotResponseMaybeWithStrJson(copilotResponseMaybeWithStrJson);
        return findPossibleValuesOfFieldFromParsedCopilotResponse(parsedCopilotResponse, fieldName, filter)
            .filter((value): value is boolean | string => value !== undefined && (typeof value === "boolean" || typeof value === "string"))
            .map((value): string | boolean | undefined => typeof value === "boolean" ? value : value.toLowerCase() === "true" || value.toLowerCase() === "false" ? JSON.parse(value.toLowerCase()) as boolean : undefined)
            .find((value): value is boolean => value !== undefined && typeof value === "boolean");
    } catch (e) {
        console.log(e);
        return undefined;
    }
}

function parseCopilotResponseMaybeWithStrJson(copilotResponseMaybeWithStrJson: string): { [key: string]: (string | boolean | number | object) } {
    try {
        copilotResponseMaybeWithStrJson = copilotResponseMaybeWithStrJson
            .trim()
            .replace(/\n/g, "");
        if (copilotResponseMaybeWithStrJson.indexOf("{") === -1) {
            copilotResponseMaybeWithStrJson = "{" + copilotResponseMaybeWithStrJson;
        }
        if (copilotResponseMaybeWithStrJson.endsWith(",")) {
            copilotResponseMaybeWithStrJson = copilotResponseMaybeWithStrJson.substring(0, copilotResponseMaybeWithStrJson.length - 1);
        }
        if (copilotResponseMaybeWithStrJson.indexOf("}") === -1) {
            copilotResponseMaybeWithStrJson = copilotResponseMaybeWithStrJson + "}";
        }
        const maybeJsonCopilotResponse = copilotResponseMaybeWithStrJson.substring(copilotResponseMaybeWithStrJson.indexOf("{"), copilotResponseMaybeWithStrJson.lastIndexOf("}") + 1);
        return JSON.parse(maybeJsonCopilotResponse) as { [key: string]: (string | boolean | number | object) };
    } catch (e) {
        console.log(e);
        return {};
    }
}

function findPossibleValuesOfFieldFromParsedCopilotResponse(parsedCopilotResponse: { [key: string]: (string | boolean | number | object) }, fieldName: string, filter?: string[]): (string | boolean | number | object)[] {
    const exactMatches = Object.keys(parsedCopilotResponse)
        .filter((key) => key.toLowerCase() === fieldName.toLowerCase());
    const containsMatches = Object.keys(parsedCopilotResponse)
        .filter((key) => key.toLowerCase().includes(fieldName.toLowerCase()))
        .filter((key) => filter === undefined || filter.every((filterValue) => !key.toLowerCase().includes(filterValue.toLowerCase())));
    return [...exactMatches, ...containsMatches].map((key) => parsedCopilotResponse[key]);
}
