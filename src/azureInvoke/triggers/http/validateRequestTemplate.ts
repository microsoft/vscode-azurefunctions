/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../localize';
import { type HttpHeaderOrQueryParameter, type HttpRequest } from '../../models/httpSchema';
import { prepareHttpRequest, validateRequestMethodAndBody } from './prepareHttpRequest';
import { httpAuthorityPattern, placeholderPattern, shouldExpectJsonBody } from './requestTemplateRules';

const placeholderTempValue = 'value';

/**
 * Checks a request template before any prerequisites run. Uses stand-in values in a copy and returns nothing on success.
 */
export function validateRequestTemplate(request: HttpRequest): void {
    validateRequestMethodAndBody(request);

    const authority = httpAuthorityPattern.exec(request.url)?.[0];
    if (!authority || authority.includes('{{')) {
        throw new Error(localize('azureInvoke.variableHost', 'Use a fixed HTTP or HTTPS host. Response variables cannot change the protocol, host, or URL credentials.'));
    }

    const allowedPlaceholderNames = new Set(request.bindings?.map(binding => binding.name));
    // Allow {{guid}} so users can ask Invoke for a new ID at send time instead of linking a value from another request.
    allowedPlaceholderNames.add('guid');

    // Check that the request can be prepared before the real values are available.
    const substitutePlaceholdersForValidation = (template: string): string => {
        const result = template.replace(placeholderPattern, (_match, name: string) => {
            if (!allowedPlaceholderNames.has(name)) {
                throw new Error(localize('azureInvoke.unknownVariable', 'A variable is not defined. Use {{guid}} for a generated UUID or add its source link in Dependencies before sending.'));
            }
            return placeholderTempValue;
        });

        // Valid placeholders were replaced above. Treat any remaining '{{' as malformed, even if it was meant as literal text.
        if (result.includes('{{')) {
            throw new Error(localize('azureInvoke.invalidVariable', 'Use response variables in the form {{name}}.'));
        }

        return result;
    };

    // Copies one header or query row, replacing placeholders in its value only when enabled.
    const prepareParamForValidation = (param: HttpHeaderOrQueryParameter): HttpHeaderOrQueryParameter => {
        // Disabled rows are not sent, so their placeholders do not need to resolve.
        if (param.enabled === false) {
            return { ...param };
        }

        if (param.name.includes('{{')) {
            throw new Error(localize('azureInvoke.variableFieldName', 'Use variables in field values, not field names.'));
        }

        return { ...param, value: substitutePlaceholdersForValidation(param.value) };
    };

    const body = request.body;
    // Only bodies with placeholder syntax need this template check.
    if (body.includes('{{') && shouldExpectJsonBody(request)) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch {
            throw new Error(localize('azureInvoke.variableJson', 'Use valid JSON with quoted placeholders, such as {"id":"{{accountId}}"}, in a linked JSON body.'));
        }

        validateJsonFieldNames(parsed);
    }

    prepareHttpRequest({
        ...request,
        url: substitutePlaceholdersForValidation(request.url),
        body: substitutePlaceholdersForValidation(body),
        headers: request.headers.map(prepareParamForValidation),
        query: request.query.map(prepareParamForValidation),
    });
}

/**
 * Walks a parsed JSON body depth-first using a stack.
 * The body is the root, and object values and array items are its children.
 * Throws if any field name contains '{{'. Placeholders may supply values, not names.
 */
function validateJsonFieldNames(parsedBody: unknown): void {
    const pending = [parsedBody];
    while (pending.length) {
        const value = pending.pop();
        if (Array.isArray(value)) {
            // Array items have no field names of their own, but they can contain objects with names to check.
            for (const child of value) {
                pending.push(child);
            }
        } else if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                if (key.includes('{{')) {
                    throw new Error(localize('azureInvoke.variableFieldName', 'Use variables in field values, not field names.'));
                }
                pending.push(child);
            }
        }
    }
}
