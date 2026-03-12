/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stripAnsiControlCharacters } from '../utils/ansiUtils';
import { type IRunningFuncTask } from './funcHostTask';

export function getRecentLogs(task: IRunningFuncTask | undefined, limit: number = 250): string {
    const logs = task?.logs ?? [];
    const recent = logs.slice(Math.max(0, logs.length - limit));
    return recent.join('');
}

export function getRecentLogsPlainText(task: IRunningFuncTask | undefined, limit: number = 250): string {
    return stripAnsiControlCharacters(getRecentLogs(task, limit));
}

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
