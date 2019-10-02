/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Unlike templates.json and bindings.json, Resources.json has a capital letter
 */
export async function getScriptResourcesPath(templatesPath: string, vscodeLang: string = vscode.env.language): Promise<string> {
    const folder: string = path.join(templatesPath, 'resources');

    try {
        // Example: "en-US"
        const parts: string[] = vscodeLang.split('-');
        // Example: "en" for "english"
        const language: string = parts[0];
        // Example: "US" for "United States" (locale is optional)
        let locale: string | undefined = parts[1];

        const files: string[] = await fse.readdir(folder);
        let matchingFile: string | undefined;
        if (!locale) {
            const regExp: RegExp = new RegExp(`resources\\.${language}\\.json`, 'i');
            matchingFile = files.find(f => regExp.test(f));
        }

        if (!matchingFile) {
            // tslint:disable-next-line: strict-boolean-expressions
            locale = locale || '[a-z]*';
            const regExp: RegExp = new RegExp(`resources\\.${language}(-${locale})?\\.json`, 'i');
            matchingFile = files.find(f => regExp.test(f));
        }

        if (matchingFile) {
            return path.join(folder, matchingFile);
        }
    } catch {
        // ignore and fall back to english
    }

    return path.join(folder, 'Resources.json');
}
