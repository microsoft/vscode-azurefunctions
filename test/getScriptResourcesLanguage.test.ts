/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getScriptResourcesLanguage } from '../extension.bundle';

async function verifyLanguage(vscodeLanguage: string, expected: string): Promise<void> {
    assert.strictEqual(getScriptResourcesLanguage(vscodeLanguage), expected);
}

suite('getScriptResourcesLanguage', () => {
    // list of VS Code locales: https://code.visualstudio.com/docs/getstarted/locales
    test('en', async () => { await verifyLanguage('en', 'en-US'); });
    test('zh-CN', async () => { await verifyLanguage('zh-CN', 'zh-CN'); });
    test('zh-TW', async () => { await verifyLanguage('zh-TW', 'zh-TW'); });
    test('fr', async () => { await verifyLanguage('fr', 'fr-FR'); });
    test('de', async () => { await verifyLanguage('de', 'de-DE'); });
    test('it', async () => { await verifyLanguage('it', 'it-IT'); });
    test('es', async () => { await verifyLanguage('es', 'es-ES'); });
    test('ja', async () => { await verifyLanguage('ja', 'ja-JP'); });
    test('ko', async () => { await verifyLanguage('ko', 'ko-KR'); });
    test('ru', async () => { await verifyLanguage('ru', 'ru-RU'); });
    test('bg', async () => { await verifyLanguage('bg', 'en-US'); }); // not translated in templates for some reason
    test('hu', async () => { await verifyLanguage('hu', 'hu-HU'); });
    test('pt-br', async () => { await verifyLanguage('pt-br', 'pt-BR'); });
    test('tr', async () => { await verifyLanguage('tr', 'tr-TR'); });

    // A few extra cases that might be possible, but aren't covered by current lists of locales
    test('pt-pt', async () => { await verifyLanguage('pt-pt', 'pt-PT'); });
    test('unknown', async () => { await verifyLanguage('unknown', 'en-US'); });
    test('empty', async () => { await verifyLanguage('', 'en-US'); });
});
