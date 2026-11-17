/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Top-level `name = <...>FunctionApp(...)`, optionally annotated; also covers ASGI/WSGI and Durable (`df.DFApp`) apps.
const appAssignmentPattern = /^([A-Za-z_]\w*)\s*(?::[^=\r\n]*)?=\s*(?:[A-Za-z_]\w*\.)*\w*(?:FunctionApp|DFApp)\s*\(/m;
const funcImportPattern = /^\s*(?:import\s+azure\.functions\s+as\s+func|from\s+azure\s+import\s+functions\s+as\s+func)\b/m;
const logImportPattern = /^\s*import\s+(?:[\w.]+\s*,\s*)*logging\s*(?:,|;|$)/m;

/**
 * Builds the text to append to function_app.py for a Connector Trigger function. Existing code is never modified:
 * the app name is a best-effort guess (defaulting to `app`), and only missing imports the snippet uses are appended.
 */
export function getPythonFunctionAppAppendix(contents: string, lineEnding: string): { prefix: string; appName: string } {
    const code = stripStringsAndComments(contents);
    const imports: string[] = [];
    if (!funcImportPattern.test(code)) {
        imports.push('import azure.functions as func');
    }
    if (!logImportPattern.test(code)) {
        imports.push('import logging');
    }
    return {
        prefix: imports.length ? `${imports.join(lineEnding)}${lineEnding}${lineEnding}` : '',
        appName: appAssignmentPattern.exec(code)?.[1] ?? 'app',
    };
}

/** Blanks strings and comments while preserving offsets. */
function stripStringsAndComments(contents: string): string {
    return contents.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|#[^\r\n]*/g,
        match => match.replace(/[^\r\n]/g, ' '));
}