/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import { isDeepStrictEqual } from 'util';

export function isJsonObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function setJsoncValue(contents: string, jsonPath: jsonc.JSONPath, value: unknown, formattingOptions?: jsonc.FormattingOptions): string {
    return jsonc.applyEdits(contents, jsonc.modify(contents, jsonPath, value, formattingOptions ? { formattingOptions } : {}));
}

export function setJsoncValues(
    contents: string,
    existing: unknown,
    updated: unknown,
    replaceArray: (path: jsonc.JSONPath) => boolean = () => false,
): string {
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
        } else if (Array.isArray(current) && Array.isArray(value) && !replaceArray(jsonPath)) {
            value.forEach((child: unknown, index: number) => edit(current[index], child, [...jsonPath, index]));
        } else {
            contents = setJsoncValue(contents, jsonPath, value, formattingOptions);
        }
    }
    edit(existing, updated, []);
    return contents;
}
