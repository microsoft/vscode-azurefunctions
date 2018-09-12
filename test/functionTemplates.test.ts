/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IHookCallbackContext } from 'mocha';
import { JavaProjectCreator } from '../src/commands/createNewProject/JavaProjectCreator';
import { ProjectLanguage, ProjectRuntime, TemplateFilter } from '../src/constants';
import { FunctionTemplates, getFunctionTemplates } from '../src/templates/FunctionTemplates';
import { IFunctionTemplate } from '../src/templates/IFunctionTemplate';

let backupTemplates: FunctionTemplates;
let latestTemplates: FunctionTemplates | undefined;

// tslint:disable-next-line:no-function-expression
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(30 * 1000);
    backupTemplates = <FunctionTemplates>(await getFunctionTemplates());
    latestTemplates = <FunctionTemplates>(await getFunctionTemplates());
    // https://github.com/Microsoft/vscode-azurefunctions/issues/334
});

suite('Template Count Tests', async () => {
    test('Valid templates count', async () => {
        if (latestTemplates) {
            await validateTemplateCounts(latestTemplates);
        } else {
            assert.fail('Failed to find templates from functions portal.');
        }

        await validateTemplateCounts(backupTemplates);
    });
});

async function validateTemplateCounts(templates: FunctionTemplates): Promise<void> {
    const jsTemplatesv1: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.JavaScript, ProjectRuntime.v1, TemplateFilter.Verified);
    assert.equal(jsTemplatesv1.length, 8, 'Unexpected JavaScript v1 templates count.');

    const jsTemplatesv2: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.JavaScript, ProjectRuntime.v2, TemplateFilter.Verified);
    assert.equal(jsTemplatesv2.length, 5, 'Unexpected JavaScript v2 templates count.');

    const javaTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.Java, JavaProjectCreator.defaultRuntime, TemplateFilter.Verified);
    assert.equal(javaTemplates.length, 4, 'Unexpected Java templates count.');

    const cSharpTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.CSharp, ProjectRuntime.v1, TemplateFilter.Verified);
    assert.equal(cSharpTemplates.length, 7, 'Unexpected CSharp (.NET Framework) templates count.');

    const cSharpTemplatesv2: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.CSharp, ProjectRuntime.v2, TemplateFilter.Verified);
    assert.equal(cSharpTemplatesv2.length, 4, 'Unexpected CSharp (.NET Core) templates count.');

    const pythonTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.Python, ProjectRuntime.v2, TemplateFilter.Verified);
    assert.equal(pythonTemplates.length, 5, 'Unexpected Python templates count.');
}
