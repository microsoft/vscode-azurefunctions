/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { ext, getResourcesPath } from '../extension.bundle';
import { testFolderPath } from './global.test';

async function verifyLanguage(vscodeLanguage: string, fileName: string, templatesPath?: string): Promise<void> {
    templatesPath = templatesPath || ext.context.asAbsolutePath(path.join('resources', 'backupScriptTemplates', '~2'));
    const actual: string = await getResourcesPath(templatesPath, vscodeLanguage);
    assert.equal(actual, path.join(templatesPath, 'resources', fileName));
}

suite('getResourcesPath Tests', async () => {
    let extraTemplatesPath: string;
    suiteSetup(async () => {
        extraTemplatesPath = path.join(testFolderPath, 'extraTemplates');
        const extraResourcesPath: string = path.join(extraTemplatesPath, 'resources');
        await fse.ensureFile(path.join(extraResourcesPath, 'Resources.aa.json'));
        await fse.ensureFile(path.join(extraResourcesPath, 'Resources.aa-bb.json'));
        await fse.ensureFile(path.join(extraResourcesPath, 'Resources.aa-cc.json'));
        await fse.ensureFile(path.join(extraResourcesPath, 'Resources.dd.json'));
    });

    // list of VS Code locales: https://code.visualstudio.com/docs/getstarted/locales
    test('en', async () => { await verifyLanguage('en', 'Resources.json'); });
    test('zh-CN', async () => { await verifyLanguage('zh-CN', 'Resources.zh-CN.json'); });
    test('zh-TW', async () => { await verifyLanguage('zh-TW', 'Resources.zh-TW.json'); });
    test('fr', async () => { await verifyLanguage('fr', 'Resources.fr-FR.json'); });
    test('de', async () => { await verifyLanguage('de', 'Resources.de-DE.json'); });
    test('it', async () => { await verifyLanguage('it', 'Resources.it-IT.json'); });
    test('es', async () => { await verifyLanguage('es', 'Resources.es-ES.json'); });
    test('ja', async () => { await verifyLanguage('ja', 'Resources.ja-JP.json'); });
    test('ko', async () => { await verifyLanguage('ko', 'Resources.ko-KR.json'); });
    test('ru', async () => { await verifyLanguage('ru', 'Resources.ru-RU.json'); });
    test('bg', async () => { await verifyLanguage('bg', 'Resources.json'); }); // not translated in templates for some reason
    test('hu', async () => { await verifyLanguage('hu', 'Resources.hu-HU.json'); });
    test('pt-br', async () => { await verifyLanguage('pt-br', 'Resources.pt-BR.json'); });
    test('tr', async () => { await verifyLanguage('tr', 'Resources.tr-TR.json'); });

    // A few extra cases that might be possible, but aren't covered by current lists of locales
    test('pt-pt', async () => { await verifyLanguage('pt-pt', 'Resources.pt-PT.json'); });
    test('unknown', async () => { await verifyLanguage('unknown', 'Resources.json'); });
    test('empty', async () => { await verifyLanguage('', 'Resources.json'); });
    test('aa', async () => { await verifyLanguage('aa', 'Resources.aa.json', extraTemplatesPath); });
    test('aa-bb', async () => { await verifyLanguage('aa-bb', 'Resources.aa-bb.json', extraTemplatesPath); });
    test('aa-cc', async () => { await verifyLanguage('aa-cc', 'Resources.aa-cc.json', extraTemplatesPath); });
    test('dd-ee', async () => { await verifyLanguage('dd-ee', 'Resources.dd.json', extraTemplatesPath); });
});
