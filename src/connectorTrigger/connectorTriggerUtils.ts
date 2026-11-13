/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Keep runtime imports out of this module so every connector layer can use it.
import { type IActionContext } from '@microsoft/vscode-azext-utils';

/** Adds each non-empty value to the action's masked values once. */
export function addValuesToMask(context: Pick<IActionContext, 'valuesToMask'>, ...values: (string | undefined)[]): void {
    for (const value of values) {
        if (value && !context.valuesToMask.includes(value)) {
            context.valuesToMask.push(value);
        }
    }
}

/** Ordinal case-insensitive comparison for identifiers such as connector, operation and setting names. */
export function equalsIgnoreCase(left: string | undefined, right: string | undefined): boolean {
    return typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase();
}

/** Returns the trimmed string, or undefined for a non-string or blank value. */
export function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
}

/** Reads the HTTP status of a failed Azure request from `statusCode` or `response.status`. */
export function getStatusCode(error: unknown): number | undefined {
    if (!isRecord(error)) {
        return undefined;
    }
    if (typeof error.statusCode === 'number') {
        return error.statusCode;
    }
    return isRecord(error.response) && typeof error.response.status === 'number' ? error.response.status : undefined;
}

/**
 * Reads an environment variable as a process does: an exact-case name wins, and other casings match only when
 * `ignoreCase` is set. Names are case-insensitive on Windows and case-sensitive elsewhere.
 */
export function getEnvironmentValue(
    environment: Readonly<Record<string, string | undefined>>,
    name: string,
    ignoreCase: boolean = process.platform === 'win32',
): string | undefined {
    if (Object.hasOwn(environment, name)) {
        return environment[name];
    }
    if (!ignoreCase) {
        return undefined;
    }
    const key = Object.keys(environment).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : environment[key];
}

/** Finds a local.settings.json Values key the way the host does: an exact match first, otherwise case-insensitively. */
export function findSettingKey(values: Readonly<Record<string, unknown>>, name: string): string | undefined {
    return Object.hasOwn(values, name) ?
        name :
        Object.keys(values).find(candidate => candidate.toLowerCase() === name.toLowerCase());
}
