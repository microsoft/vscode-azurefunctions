/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Template, TemplateLanguage } from '../src/templates/Template';
import { TemplateData } from '../src/templates/TemplateData';

const templateFilterSetting: string = 'azureFunctions.templateFilter';
const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();
// tslint:disable-next-line:no-backbone-get-set-outside-model
const oldTemplateFilter: string | undefined = config.get(templateFilterSetting);

suiteTeardown(async () => {
    await config.update(templateFilterSetting, oldTemplateFilter, vscode.ConfigurationTarget.Global);
});

suite('Template Data Tests', () => {
    const templateData: TemplateData = new TemplateData();

    test('JavaScript Verified Templates Count', async () => {
        await config.update(templateFilterSetting, 'Verified', vscode.ConfigurationTarget.Global);
        const templates: Template[] = await templateData.getTemplates(TemplateLanguage.JavaScript);
        assert.equal(templates.length, 8);
    });

    test('Java Templates Count', async () => {
        const templates: Template[] = await templateData.getTemplates(TemplateLanguage.Java);
        assert.equal(templates.length, 4);
    });
});
