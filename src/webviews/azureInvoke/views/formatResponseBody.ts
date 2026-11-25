/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { applyEdits, format } from 'jsonc-parser';

/**
 * Indents valid JSON for display. Other response text is returned unchanged.
 */
export function formatResponseBody(body: string): string {
    try {
        JSON.parse(body);
    } catch (error) {
        if (error instanceof SyntaxError) {
            return body;
        }
        throw error;
    }

    // Change whitespace only, preserving numeric precision and string escapes.
    return applyEdits(body, format(body, undefined, { insertSpaces: true, tabSize: 2, eol: '\n' }));
}
