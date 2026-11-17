/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';

// Top-level `name = func.FunctionApp(...)`, optionally annotated; also covers ASGI/WSGI and Durable (`df.DFApp`) apps.
const appAssignmentPattern = /^([A-Za-z_]\w*)\s*(?::[^=\r\n]*)?=\s*(?:[A-Za-z_]\w*\.)*(?:FunctionApp|AsgiFunctionApp|WsgiFunctionApp|DFApp)\s*\(/gm;
const funcImportPattern = /^import azure\.functions as func\b/m;
const logImportPattern = /^import logging\b/m;

/**
 * Prepares function_app.py for appended Connector Trigger functions: adds the `func` and `logging` imports they use
 * and, when the file has no Function App yet, a `func.FunctionApp()` instance. Returns the app name to decorate with.
 */
export function preparePythonFunctionApp(contents: string, lineEnding: string): { contents: string; appName: string } {
    let names = getAppNames(contents);
    if (names.length > 1) {
        throw new Error(localize('connectorPythonFunctionAppAmbiguous',
            'function_app.py defines more than one Function App ({0}). The Python worker supports only one, so keep a single Function App and try again.',
            names.join(', ')));
    }
    if (!funcImportPattern.test(stripStringsAndComments(contents))) {
        contents = insertAfterImports(contents, 'import azure.functions as func', lineEnding);
    }
    if (!logImportPattern.test(stripStringsAndComments(contents))) {
        contents = contents.replace(funcImportPattern, match => `${match}${lineEnding}import logging`);
    }
    if (names.length === 0) {
        const appName = /^app\s*[:=]/m.test(stripStringsAndComments(contents)) ? 'function_app' : 'app';
        contents = insertAfterImports(contents, `${lineEnding}${appName} = func.FunctionApp()`, lineEnding);
        names = [appName];
    }
    return { contents, appName: names[0] };
}

function getAppNames(contents: string): string[] {
    return [...stripStringsAndComments(contents).matchAll(appAssignmentPattern)].map(match => match[1]);
}

/** Blanks strings and comments while preserving offsets, so matches index into the original contents. */
function stripStringsAndComments(contents: string): string {
    return contents.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|#[^\r\n]*/g,
        match => match.replace(/[^\r\n]/g, ' '));
}

function insertAfterImports(contents: string, text: string, lineEnding: string): string {
    const stripped = stripStringsAndComments(contents);
    const imports = [...stripped.matchAll(/^(?:import|from)\s[^\r\n]*/gm)];
    const last = imports[imports.length - 1];
    if (!last || last.index === undefined) {
        return `${text.trimStart()}${lineEnding}${contents}`;
    }
    let end = last.index + last[0].length;
    // Extend over parenthesized or backslash-continued import lists.
    if (last[0].includes('(') && !last[0].includes(')')) {
        const close = stripped.indexOf(')', end);
        end = close < 0 ? end : close + 1;
    }
    while (stripped.slice(0, end).trimEnd().endsWith('\\')) {
        const next = stripped.slice(end).match(/^\r?\n[^\r\n]*/);
        if (!next) {
            break;
        }
        end += next[0].length;
    }
    const lineEnd = stripped.slice(end).search(/\r?\n|$/);
    end += lineEnd;
    return `${contents.slice(0, end)}${lineEnding}${text}${contents.slice(end)}`;
}