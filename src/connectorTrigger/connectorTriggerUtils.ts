/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';

export function maskValues(context: Pick<IActionContext, 'valuesToMask'>, ...values: (string | undefined)[]): void {
    for (const value of values) {
        if (value && !context.valuesToMask.includes(value)) {
            context.valuesToMask.push(value);
        }
    }
}

export function getStatusCode(value: unknown): number | undefined {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    if ('statusCode' in value && typeof value.statusCode === 'number') {
        return value.statusCode;
    }
    if ('response' in value && typeof value.response === 'object' && value.response !== null &&
        'status' in value.response && typeof value.response.status === 'number') {
        return value.response.status;
    }
    return undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
}

export function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
