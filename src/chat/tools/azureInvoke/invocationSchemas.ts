/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { localize } from '../../../localize';
import { httpMethods, isInvocationName, isResponseBindingName, isResponsePointer } from '../../../azureInvoke/model';

export const idSchema = z.string().check(z.minLength(1), z.maxLength(100));

const httpInvocationEntrySchema = z.object({
    name: z.string(),
    value: z.string(),
    enabled: z.optional(z.boolean()),
});

export const httpInvocationInputSchema = z.object({
    name: z.string().check(
        z.minLength(1),
        z.maxLength(60),
        z.refine(isInvocationName, { error: localize('azureInvoke.invalidAiName', 'Enter a short name of 1 to 60 characters without line breaks.') }),
    ),
    url: z.url({ protocol: /^https?$/ }).check(z.refine(value => {
        if (!URL.canParse(value)) {
            return false;
        }
        const url = new URL(value);
        return !url.username && !url.password;
    }, { error: localize('azureInvoke.invalidProtocol', 'Use an HTTP or HTTPS URL without embedded credentials. Add authentication in Headers.') })),
    method: z.optional(z.enum(httpMethods)),
    headers: z.optional(z.array(httpInvocationEntrySchema).check(z.maxLength(100))),
    query: z.optional(z.array(httpInvocationEntrySchema).check(z.maxLength(100))),
    body: z.optional(z.string().check(z.maxLength(5 * 1024 * 1024))),
    dependsOn: z.optional(z.array(idSchema).check(z.maxLength(100))),
    bindings: z.optional(z.array(z.object({
        name: z.string().check(z.refine(isResponseBindingName)),
        sourceId: idSchema,
        pointer: z.string().check(z.refine(isResponsePointer)),
    })).check(z.maxLength(100))),
});

export const httpInvocationResponseSchema = z.object({
    status: z.number(),
    duration: z.number(),
    headers: z.optional(z.array(z.object({
        name: z.string(),
        value: z.string(),
    }))),
    body: z.optional(z.string()),
});
