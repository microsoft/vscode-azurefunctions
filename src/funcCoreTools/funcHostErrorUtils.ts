/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stripAnsiControlCharacters } from '../utils/ansiUtils';

export interface FuncHostErrorContextOptions {
    /**
     * Number of log lines to include before an error line
     */
    before?: number;
    /**
     * Number of log lines to include after an error line
     */
    after?: number;
    /**
     * Maximum number of log lines to return (keeps the most recent)
     */
    max?: number;
}

// eslint-disable-next-line no-control-regex
const redAnsiRegex = /\u001b\[(?:[0-9;]*31m|[0-9;]*91m)/;

export function isFuncHostErrorLog(log: string): boolean {
    return redAnsiRegex.test(log);
}

/**
 * Extracts context for only a single relevant error line (as selected in the UI).
 *
 * @param errorMessage A plain-text error line (ANSI/control chars already removed).
 */
export function extractFuncHostErrorContextForErrorMessage(
    logs: readonly string[],
    errorMessage: string,
    options?: FuncHostErrorContextOptions
): string[] {
    const target = (errorMessage ?? '').trim();
    if (!target) {
        return [];
    }

    const before = options?.before ?? 5;
    const after = options?.after ?? 15;
    const max = options?.max ?? 250;

    let bestIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < logs.length; i++) {
        const line = logs[i];
        if (!isFuncHostErrorLog(line)) {
            continue;
        }

        const plain = stripAnsiControlCharacters(line).trim();
        if (!plain) {
            continue;
        }

        let score = 0;
        if (plain === target) {
            score = 2;
        } else if (plain.includes(target) || target.includes(plain)) {
            score = 1;
        }

        if (score > 0 && (score > bestScore || (score === bestScore && i > bestIndex))) {
            bestScore = score;
            bestIndex = i;
        }
    }

    if (bestIndex < 0) {
        return [];
    }

    const start = Math.max(0, bestIndex - before);
    const end = Math.min(logs.length - 1, bestIndex + after);

    const result = logs.slice(start, end + 1);

    if (result.length > max) {
        return result.slice(result.length - max);
    }

    return result;
}
