/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stripAnsiControlCharacters } from '../utils/ansiUtils';

/**
 * Regex that matches a Functions-host timestamp prefix, e.g. `[2026-03-11T19:57:44.622Z]`.
 * Used to split raw terminal chunks into logical log entries.
 */
const funcHostTimestampRegex = /(?=\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z\])/;

/**
 * Collapse all whitespace runs to a single space for dedup comparison.
 * Terminal reflow wraps the same logical message at different column positions
 * depending on window width, producing different newline/space patterns for
 * an otherwise identical log entry.
 */
function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

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

// Detect red/bright-red foreground in any of the common SGR forms:
//   Basic 4-bit:    \x1b[31m  (red)  /  \x1b[91m  (bright red), with optional extra params
//   256-color:      \x1b[38;5;1m (red) / \x1b[38;5;9m (bright red)
//   24-bit RGB:     \x1b[38;2;R;G;Bm  where R is dominant (R≥128, G≤64, B≤64)
// eslint-disable-next-line no-control-regex
const basicRedRegex = /\u001b\[(?:(?:\d+;)*(?:31|91)(?:;\d+)*m)/;
// eslint-disable-next-line no-control-regex
const extended256RedRegex = /\u001b\[38;5;(?:1|9)m/;

function isRedAnsi(text: string): boolean {
    return basicRedRegex.test(text) || extended256RedRegex.test(text);
}

export function isFuncHostErrorLog(log: string): boolean {
    return isRedAnsi(log);
}

/**
 * Splits a raw terminal chunk into logical log entries (by timestamp boundaries),
 * checks each entry for red ANSI codes, and appends only genuinely new error
 * entries to the given errorLogs array.
 *
 * @param errorLogs The mutable array of plain-text error strings to append to.
 * @param rawChunk  A raw terminal output chunk (may contain ANSI + multiple log entries).
 * @returns `true` if at least one new error entry was added.
 */
export function addErrorLinesFromChunk(errorLogs: string[], rawChunk: string): boolean {
    const seen = new Set(errorLogs.map(normalizeWhitespace));
    let added = false;

    // Split on timestamp boundaries so each segment is a complete log entry.
    for (const segment of rawChunk.split(funcHostTimestampRegex)) {
        if (!isFuncHostErrorLog(segment)) {
            continue;
        }

        const plain = stripAnsiControlCharacters(segment).trim();
        if (!plain) {
            continue;
        }

        const normalized = normalizeWhitespace(plain);
        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        errorLogs.push(plain);
        added = true;
    }

    // Keep the most recent few to avoid unbounded memory usage.
    const maxErrors = 10;
    if (errorLogs.length > maxErrors) {
        errorLogs.splice(0, errorLogs.length - maxErrors);
    }

    return added;
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
