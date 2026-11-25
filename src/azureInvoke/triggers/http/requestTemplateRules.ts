/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bindingNamePattern, type HttpRequest } from '../../models/httpSchema';

// Matches placeholders (e.g. {{accountId}}) and captures the name inside the braces.
const placeholderSource = String.raw`\{\{(${bindingNamePattern})\}\}`;
export const placeholderPattern = new RegExp(placeholderSource, 'g');
export const exactPlaceholderPattern = new RegExp(`^${placeholderSource}$`);

// Match the scheme and authority (e.g. 'http://localhost:7071' from 'http://localhost:7071/api/accounts').
export const httpAuthorityPattern = /^https?:\/\/[^/?#]+/i;

export function shouldExpectJsonBody({ body, headers }: HttpRequest): boolean {
    // Treat a leading '[' or '{' as JSON even without a Content-Type header.
    const startsWithJsonObjectOrArray = /^\s*[\[{]/.test(body);
    if (startsWithJsonObjectOrArray) {
        return true;
    }

    const hasEnabledJsonContentType = headers.some(header =>
        // Ignore unchecked headers because they will not be sent.
        header.enabled !== false &&
        // HTTP header names are case-insensitive.
        header.name.toLowerCase() === 'content-type' &&
        /json/i.test(header.value)
    );

    return hasEnabledJsonContentType;
}
