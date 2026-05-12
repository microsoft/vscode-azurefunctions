/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Removes ANSI escape sequences and other terminal control characters from a string.
 * This is intended for presenting Function Host output in a plain text editor / clipboard.
 */
export function stripAnsiControlCharacters(text: string): string {
    if (!text) {
        return text;
    }

    // OSC (Operating System Command) sequences, e.g. "ESC ] 0 ; title BEL" or terminated by "ESC \\"
    // Also supports the single-character C1 control alternative (0x9D).
    // eslint-disable-next-line no-control-regex
    const oscRegex = /(?:\u001B\]|\u009D)[\s\S]*?(?:\u0007|\u001B\\)/g;

    // DCS/PM/APC string sequences, terminated by ST ("ESC \\").
    // - DCS: ESC P ... ESC \\  (C1 alternative: 0x90)
    // - PM:  ESC ^ ... ESC \\  (C1 alternative: 0x9E)
    // - APC: ESC _ ... ESC \\  (C1 alternative: 0x9F)
    // eslint-disable-next-line no-control-regex
    const stringTerminatedRegex = /(?:\u001B[P^_]|[\u0090\u009E\u009F])[\s\S]*?\u001B\\/g;

    // Most CSI + single ESC sequences (covers common color codes, cursor movement, etc.)
    // This pattern is derived from common community implementations (e.g. "ansi-regex") but
    // kept local to avoid adding a dependency for a single utility.
    // eslint-disable-next-line no-control-regex
    const ansiRegex = /[\u001B\u009B][[\]()#;?]*(?:(?:\d{1,4})(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

    let result = text;
    result = result.replace(oscRegex, '');
    result = result.replace(stringTerminatedRegex, '');
    result = result.replace(ansiRegex, '');

    // Remove remaining C0 control characters (except tab, newline, carriage return) + DEL.
    // These can slip in from terminal output streams.
    result = Array.from(result)
        .filter((ch) => {
            const code = ch.charCodeAt(0);
            // Preserve TAB (9), LF (10), CR (13). Strip other C0 controls and DEL.
            return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
        })
        .join('');

    return result;
}
