/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';
import { type HttpInvocation, type HttpRequest } from './models/httpSchema';
import { exactPlaceholderPattern, shouldExpectJsonBody } from './triggers/http/requestTemplateRules';

const credentialFields = new Set([
    'apikey', 'authtoken', 'accesstoken', 'refreshtoken', 'idtoken', 'token',
    'clientsecret', 'password', 'passwd', 'secret', 'connectionstring',
]);
const credentialHeaders = new Set(['cookie', 'setcookie', 'xfunctionskey', 'xapikey', 'xauthtoken']);
const normalizeName = (name: string): string => name.trim().toLowerCase().replace(/[-_]/g, '');

// This exact recipe contains no reusable password. Arbitrary text mixed with a binding is not safe.
const syntheticPassword = 'Example-{{guid}}-Aa1!';

/**
 * Finds the first likely literal credential, including in disabled rows.
 * This is not a general-purpose secret scanner.
 */
export function findCollectionExportCredential(invocations: readonly HttpInvocation[]): { location: string; invocationNumber: number } | undefined {
    for (const [index, invocation] of invocations.entries()) {
        const location = findCredentialLocation(invocation.request);
        if (location) {
            return { location, invocationNumber: index + 1 };
        }
    }
    return undefined;
}

/**
 * Returns a fixed location label, never field names or values from the request.
 */
function findCredentialLocation(request: HttpRequest): string | undefined {
    if (request.headers.some(({ name, value }) => {
        const header = normalizeName(name);
        if (header === 'authorization' || header === 'proxyauthorization') {
            return isLiteralCredential(value.trim().replace(/^(?:Basic|Bearer)\s+/i, ''));
        }
        return (credentialHeaders.has(header) || credentialFields.has(header)) && isLiteralCredential(value);
    })) {
        return localize('azureInvoke.exportCredentialHeaders', 'Headers');
    }
    if (request.query.some(({ name, value }) => hasQueryCredential(name, value))) {
        return localize('azureInvoke.exportCredentialQuery', 'Query parameters');
    }
    if (URL.canParse(request.url)) {
        const { username, password, searchParams } = new URL(request.url);
        if (username || password || Array.from(searchParams).some(([name, value]) => hasQueryCredential(name, value))) {
            return localize('azureInvoke.exportCredentialUrl', 'the URL');
        }
    }
    if (hasBodyCredential(request)) {
        return localize('azureInvoke.exportCredentialBody', 'Body');
    }
    return undefined;
}

function hasQueryCredential(name: string, value: string): boolean {
    const field = normalizeName(name);
    // Azure Functions accepts a function key as the `code` query parameter.
    return (field === 'code' || credentialHeaders.has(field) || credentialFields.has(field)) && isLiteralCredential(value);
}

function isLiteralCredential(value: unknown): boolean {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 && !exactPlaceholderPattern.test(trimmed);
    }
    return value !== null && value !== undefined;
}

/**
 * Checks named fields in JSON and URL-encoded forms without inspecting arbitrary text.
 */
function hasBodyCredential(request: HttpRequest): boolean {
    if (request.headers.some(({ name, value }) =>
        name.trim().toLowerCase() === 'content-type' &&
        value.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded')) {
        if (Array.from(new URLSearchParams(request.body)).some(([name, value]) => hasBodyCredentialField(name, value))) {
            return true;
        }
    }
    if (!shouldExpectJsonBody(request)) {
        return false;
    }

    let body: unknown;
    try {
        body = JSON.parse(request.body);
    } catch (error) {
        if (!(error instanceof SyntaxError)) {
            throw error;
        }
        // Invalid JSON has no reliably identifiable fields. The save confirmation still asks for review.
        return false;
    }

    const pending: unknown[] = [body];
    while (pending.length) {
        const value = pending.pop();
        if (value === null || typeof value !== 'object') {
            continue;
        }
        for (const [name, field] of Object.entries(value)) {
            if (hasBodyCredentialField(name, field)) {
                return true;
            }
            if (field !== null && typeof field === 'object') {
                pending.push(field);
            }
        }
    }
    return false;
}

function hasBodyCredentialField(name: string, value: unknown): boolean {
    const field = normalizeName(name);
    return credentialFields.has(field) &&
        !(field === 'password' && value === syntheticPassword) &&
        isLiteralCredential(value);
}
