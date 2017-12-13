/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectLanguage, ProjectRuntime, TemplateFilter } from '../src/ProjectSettings';
import { Template } from '../src/templates/Template';
import { TemplateData } from '../src/templates/TemplateData';

suite('Template Data Tests', () => {
    const templateData: TemplateData = new TemplateData();

    test('Default JavaScript Templates Count', async () => {
        const templates: Template[] = await templateData.getTemplates(ProjectLanguage.JavaScript, ProjectRuntime.one, TemplateFilter.Verified);
        assert.equal(templates.length, 8);
    });

    test('Default Java Templates Count', async () => {
        const templates: Template[] = await templateData.getTemplates(ProjectLanguage.Java, ProjectRuntime.beta, TemplateFilter.Verified);
        assert.equal(templates.length, 4);
    });
});
