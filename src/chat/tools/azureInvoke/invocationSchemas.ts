/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { localize } from '../../../localize';
import { invocationIdSchema, invocationNameSchema, isValidInvocationName } from '../../../azureInvoke/models/collectionSchema';
import { httpHeaderOrQueryParameterSchema, httpMethods, httpResponseBindingSchema, maxHttpDependencies, maxHttpEntries, maxRequestBodyBytes } from '../../../azureInvoke/models/httpSchema';

// Built from the saved schema in models/httpSchema.ts. Only the differences for AI input are defined here:
// a shorter name, a URL that must parse without credentials, and optional fields that get defaults.

export const idSchema = invocationIdSchema;

export const httpInvocationInputSchema = z.object({
    name: z.string().check(
        z.minLength(1),
        z.maxLength(60),
        z.refine(isValidInvocationName, { error: localize('azureInvoke.invalidAiName', 'Enter a short name of 1 to 60 characters without line breaks.') }),
    ),
    group: z.optional(invocationNameSchema),
    url: z.url({ protocol: /^https?$/ }).check(z.refine(value => {
        // The refinement can still run after Zod rejects the URL. Avoid throwing from new URL().
        if (!URL.canParse(value)) {
            return false;
        }

        // Reject Basic Auth shorthand like https://user:pass@example.com so copied URLs
        // don't carry credentials. Use the Authorization header instead.
        const url = new URL(value);
        return !url.username && !url.password;
    }, { error: localize('azureInvoke.invalidProtocol', 'Use an HTTP or HTTPS URL without embedded credentials. Add authentication in Headers.') })),
    method: z.optional(z.enum(httpMethods)),
    headers: z.optional(z.array(httpHeaderOrQueryParameterSchema).check(z.maxLength(maxHttpEntries))),
    query: z.optional(z.array(httpHeaderOrQueryParameterSchema).check(z.maxLength(maxHttpEntries))),
    // Measured in UTF-8 bytes, like the collection and transport checks, not in characters.
    body: z.optional(z.string().check(z.refine(body => Buffer.byteLength(body) <= maxRequestBodyBytes, {
        error: localize('azureInvoke.requestTooLarge', 'Request bodies must not exceed {0} MB.', maxRequestBodyBytes / (1024 * 1024)),
    }))),
    dependsOn: z.optional(z.array(invocationIdSchema).check(z.maxLength(maxHttpDependencies))),
    bindings: z.optional(z.array(httpResponseBindingSchema).check(z.maxLength(maxHttpDependencies))),
});

export const httpInvocationResponseSchema = z.object({
    status: z.number(),
    duration: z.number(),
    // Present only when a target-only run uses earlier results from direct prerequisites instead of rerunning them.
    reusedPrerequisiteIds: z.optional(z.array(idSchema)),
    headers: z.optional(z.array(z.object({
        name: z.string(),
        value: z.string(),
    }))),
    body: z.optional(z.string()),
});
