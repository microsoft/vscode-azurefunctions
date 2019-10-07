/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const english: string = 'en-US';
const supportedLanguages: string[] = [
    'cs-CZ',
    'de-DE',
    english,
    'es-ES',
    'fr-FR',
    'hu-HU',
    'it-IT',
    'ja-JP',
    'ko-KR',
    'nl-NL',
    'pl-PL',
    'pt-BR',
    'pt-PT',
    'qps-ploc',
    'ru-RU',
    'sv-SE',
    'tr-TR',
    'zh-CN',
    'zh-TW'
];

export function getScriptResourcesLanguage(vscodeLang: string = vscode.env.language): string {
    try {
        // Example: "en-US"
        const parts: string[] = vscodeLang.split('-');
        // Example: "en" for "english"
        const language: string = parts[0];
        // Example: "US" for "United States" (locale is optional)
        let locale: string | undefined = parts[1];

        let supportedLanguage: string | undefined;
        if (!locale) {
            const regExp: RegExp = new RegExp(`^${language}$`, 'i');
            supportedLanguage = supportedLanguages.find(f => regExp.test(f));
        }

        if (!supportedLanguage) {
            // tslint:disable-next-line: strict-boolean-expressions
            locale = locale || '[a-z]*';
            const regExp: RegExp = new RegExp(`^${language}(-${locale})?$`, 'i');
            supportedLanguage = supportedLanguages.find(f => regExp.test(f));
        }

        if (supportedLanguage) {
            return supportedLanguage;
        }
    } catch {
        // ignore and fall back to english
    }

    return english;
}
