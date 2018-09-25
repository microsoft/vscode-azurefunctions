/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { JavaProjectCreator } from '../src/commands/createNewProject/JavaProjectCreator';
import { ProjectLanguage, ProjectRuntime, TemplateFilter } from '../src/constants';
import { FunctionTemplates } from '../src/templates/FunctionTemplates';
import { IFunctionTemplate } from '../src/templates/IFunctionTemplate';
import { backupTemplates, latestTemplates } from './global.test';

suite('Template Count Tests', async () => {
    test('Valid templates count', async () => {
        await validateTemplateCounts(latestTemplates);
        await validateTemplateCounts(backupTemplates);
    });
});

async function validateTemplateCounts(templates: FunctionTemplates): Promise<void> {
    const jsTemplatesv1: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.JavaScript, ProjectRuntime.v1, TemplateFilter.Verified);
    assert.equal(jsTemplatesv1.length, 8, 'Unexpected JavaScript v1 templates count.');

    const jsTemplatesv2: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.JavaScript, ProjectRuntime.v2, TemplateFilter.Verified);
    assert.equal(jsTemplatesv2.length, 7, 'Unexpected JavaScript v2 templates count.');

    const javaTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.Java, JavaProjectCreator.defaultRuntime, TemplateFilter.Verified);
    assert.equal(javaTemplates.length, 4, 'Unexpected Java templates count.');

    const cSharpTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.CSharp, ProjectRuntime.v1, TemplateFilter.Verified);
    assert.equal(cSharpTemplates.length, 9, 'Unexpected CSharp (.NET Framework) templates count.');

    const cSharpTemplatesv2: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.CSharp, ProjectRuntime.v2, TemplateFilter.Verified);
    assert.equal(cSharpTemplatesv2.length, 6, 'Unexpected CSharp (.NET Core) templates count.');

    const pythonTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.Python, ProjectRuntime.v2, TemplateFilter.Verified);
    assert.equal(pythonTemplates.length, 7, 'Unexpected Python templates count.');
}
