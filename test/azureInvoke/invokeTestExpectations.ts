/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const invokeErrorPatterns = {
    noSuccessfulPrerequisite: /current successful result/i,
    missingBindingField: /selected request or response field is missing/i,
    invalidLinkedRequestJson: /linked request body is not valid JSON/i,
    variableInUrlHost: /fixed HTTP or HTTPS host/i,
    bodyOnGetOrHead: /GET and HEAD requests cannot include a body/i,
    loopbackOnly: /limited support/i,
} as const;

export const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
