/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IHookCallbackContext } from 'mocha';
import * as path from 'path';
import { JavaProjectCreator } from '../src/commands/createNewProject/JavaProjectCreator';
import { JavaScriptProjectCreator } from '../src/commands/createNewProject/JavaScriptProjectCreator';
import { ProjectLanguage, ProjectRuntime, TemplateFilter } from '../src/ProjectSettings';
import { Template } from '../src/templates/Template';
import { getTemplateDataFromBackup, TemplateData, tryGetTemplateDataFromFuncPortal } from '../src/templates/TemplateData';

let backupTemplateData: TemplateData;
let funcPortalTemplateData: TemplateData | undefined;
let funcStagingPortalTemplateData: TemplateData | undefined;

// tslint:disable-next-line:no-function-expression
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(30 * 1000);
    backupTemplateData = await getTemplateDataFromBackup(undefined, path.join(__dirname, '..', '..'));
    funcPortalTemplateData = await tryGetTemplateDataFromFuncPortal(undefined);
    funcStagingPortalTemplateData = await tryGetTemplateDataFromFuncPortal(undefined, undefined, 'functions-staging.azure.com');
});

suite('Template Data Tests', async () => {
    test('Valid templates count', async () => {
        if (funcPortalTemplateData) {
            await validateTemplateData(funcPortalTemplateData);
        } else {
            assert.fail('Failed to find templates from functions portal.');
        }

        if (funcStagingPortalTemplateData) {
            await validateTemplateData(funcStagingPortalTemplateData);
        } else {
            assert.fail('Failed to find templates from functions staging portal.');
        }

        await validateTemplateData(backupTemplateData);
    });
});

async function validateTemplateData(templateData: TemplateData): Promise<void> {
    const jsTemplates: Template[] = await templateData.getTemplates('fakeProjectPath', ProjectLanguage.JavaScript, JavaScriptProjectCreator.defaultRuntime, TemplateFilter.Verified);
    assert.equal(jsTemplates.length, 8, 'Unexpected JavaScript templates count.');

    const javaTemplates: Template[] = await templateData.getTemplates('fakeProjectPath', ProjectLanguage.Java, JavaProjectCreator.defaultRuntime, TemplateFilter.Verified);
    assert.equal(javaTemplates.length, 4, 'Unexpected Java templates count.');

    const cSharpTemplates: Template[] = await templateData.getTemplates('fakeProjectPath', ProjectLanguage.CSharp, ProjectRuntime.one, TemplateFilter.Verified);
    assert.equal(cSharpTemplates.length, 4, 'Unexpected CSharp (.NET Framework) templates count.');

    const cSharpTemplatesv2: Template[] = await templateData.getTemplates('fakeProjectPath', ProjectLanguage.CSharp, ProjectRuntime.beta, TemplateFilter.Verified);
    assert.equal(cSharpTemplatesv2.length, 4, 'Unexpected CSharp (.NET Core) templates count.');
}
