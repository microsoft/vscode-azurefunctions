/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

let cachedAccess: vscode.ChatAccess | undefined;
async function getChatAccess(): Promise<vscode.ChatAccess> {
    if (cachedAccess === undefined || cachedAccess.isRevoked) {
        cachedAccess = await vscode.chat.requestChatAccess("copilot");
    }
    return cachedAccess;
}

const debug = false;
export function debugProgress(progress: vscode.Progress<vscode.InteractiveProgress>, msg: string) {
    if (debug) {
        progress.report({ content: new vscode.MarkdownString(`\n\n${new Date().toISOString()} >> \`${msg.replace(/\n/g, "").trim()}\`\n\n`) });
    }
    console.log(`${new Date().toISOString()} >> \`${msg.replace(/\n/g, "").trim()}\``);
}

/**
 * Feeds {@link systemPrompt} and {@link userContent} to Copilot and redirects the response directly to ${@link progress}.
 */
export async function verbatimCopilotInteraction(systemPrompt: string, userContent: string, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<{ copilotResponded: boolean, copilotResponse: string }> {
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
        const copilotResponse = await new Promise<string>((resolve, reject) => {
            request.onDidStartResponseStream(async (stream) => {
                try {
                    let joinedFragements = "";
                    for await (const fragment of stream.response) {
                        joinedFragements += fragment;
                        progress.report({ content: new vscode.MarkdownString(fragment) });
                    }
                    resolve(joinedFragements);
                } catch (e) {
                    reject(e);
                }
            });
        });
        return { copilotResponded: true, copilotResponse: copilotResponse };
    } catch (e) {
        console.log(e);
    }
    return { copilotResponded: false, copilotResponse: "" };
}

/**
 * Feeds {@link systemPrompt} and {@link userContent} to Copilot and directly returns its response.
 */
export async function getResponseAsStringCopilotInteraction(systemPrompt: string, userContent: string, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<string | undefined> {
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

        if (access.isRevoked) {
            return undefined;
        }
        const request = access.makeRequest(messages, {}, token);
        const copilotResponse = await new Promise<string>((resolve, reject) => {
            request.onDidStartResponseStream(async (stream) => {
                try {
                    let joinedFragements = "";
                    for await (const fragment of stream.response) {
                        joinedFragements += fragment;
                    }
                    resolve(joinedFragements);
                } catch (e) {
                    reject(e);
                }
            });
        });

        debugProgress(progress, copilotResponse);

        return copilotResponse;
    } catch (e) {
        console.log(e);
    }
    return undefined;
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
