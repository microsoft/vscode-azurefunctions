/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import { isDeepStrictEqual } from 'util';

/** True for a JSON object: not null and not an array. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Sets the value at `jsonPath` and returns the new text, keeping comments and formatting elsewhere.
 * Without `formattingOptions`, the value is inserted as compact JSON.
 */
export function setJsoncValue(contents: string, jsonPath: jsonc.JSONPath, value: unknown, formattingOptions?: jsonc.FormattingOptions): string {
    return jsonc.applyEdits(contents, jsonc.modify(contents, jsonPath, value, formattingOptions ? { formattingOptions } : {}));
}

/**
 * Writes each property or item of `updated` that differs from `existing` (the parsed `contents`) and returns the new text.
 * New text follows the document's indentation and line endings. Properties and items are never removed.
 */
export function setJsoncValues(contents: string, existing: unknown, updated: unknown): string {
    const indentation = contents.match(/^[\t ]+(?=")/m)?.[0];
    const formattingOptions: jsonc.FormattingOptions = {
        insertSpaces: !indentation?.includes('\t'), tabSize: indentation?.length || 4,
        eol: contents.includes('\r\n') ? '\r\n' : '\n',
    };
    function edit(current: unknown, value: unknown, jsonPath: jsonc.JSONPath): void {
        if (value === undefined || isDeepStrictEqual(current, value)) {
            return;
        }
        // Add individual properties/items rather than replacing JSONC containers and their comments.
        if (isJsonObject(current) && isJsonObject(value)) {
            for (const [key, child] of Object.entries(value)) {
                edit(current[key], child, [...jsonPath, key]);
            }
        } else if (Array.isArray(current) && Array.isArray(value)) {
            value.forEach((child: unknown, index: number) => edit(current[index], child, [...jsonPath, index]));
        } else {
            contents = setJsoncValue(contents, jsonPath, value, formattingOptions);
        }
    }
    edit(existing, updated, []);
    return contents;
}
