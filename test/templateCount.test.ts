/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IHookCallbackContext } from 'mocha';
import { IFunctionTemplate, ProjectLanguage, ProjectRuntime, TemplateFilter, TemplateProvider, TemplateSource } from '../extension.bundle';
import { longRunningTestsEnabled, runForTemplateSource, testFolderPath } from './global.test';

addSuite(undefined);
addSuite(TemplateSource.CliFeed);
addSuite(TemplateSource.StagingCliFeed);
addSuite(TemplateSource.Backup);

function addSuite(source: TemplateSource | undefined): void {
    suite(`Template Count - ${source === undefined ? 'defaultOnExtensionActivation' : source}`, async () => {
        test('JavaScript v1', async () => {
            await runForTemplateSource(source, async (templates: TemplateProvider) => {
                const jsTemplatesv1: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.JavaScript, ProjectRuntime.v1, testFolderPath, TemplateFilter.Verified);
                assert.equal(jsTemplatesv1.length, 8);
            });
        });

        test('JavaScript v2', async () => {
            await runForTemplateSource(source, async (templates: TemplateProvider) => {
                const jsTemplatesv2: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.JavaScript, ProjectRuntime.v2, testFolderPath, TemplateFilter.Verified);
                assert.equal(jsTemplatesv2.length, 12);
            });
        });

        test('Java v2', async function (this: IHookCallbackContext): Promise<void> {
            if (!longRunningTestsEnabled) {
                this.skip();
            }
            this.timeout(60 * 1000);

            await runForTemplateSource(source, async (templates: TemplateProvider) => {
                const javaTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.Java, ProjectRuntime.v2, testFolderPath, TemplateFilter.Verified);
                assert.equal(javaTemplates.length, 4);
            });
        });

        test('C# v1', async () => {
            await runForTemplateSource(source, async (templates: TemplateProvider) => {
                const cSharpTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.CSharp, ProjectRuntime.v1, testFolderPath, TemplateFilter.Verified);
                assert.equal(cSharpTemplates.length, 12);
            });
        });

        test('C# v2', async () => {
            await runForTemplateSource(source, async (templates: TemplateProvider) => {
                const cSharpTemplatesv2: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.CSharp, ProjectRuntime.v2, testFolderPath, TemplateFilter.Verified);
                assert.equal(cSharpTemplatesv2.length, 9);
            });
        });

        test('Python v2', async () => {
            await runForTemplateSource(source, async (templates: TemplateProvider) => {
                const pythonTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.Python, ProjectRuntime.v2, testFolderPath, TemplateFilter.Verified);
                assert.equal(pythonTemplates.length, 9);
            });
        });

        test('TypeScript v2', async () => {
            await runForTemplateSource(source, async (templates: TemplateProvider) => {
                const tsTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.TypeScript, ProjectRuntime.v2, testFolderPath, TemplateFilter.Verified);
                assert.equal(tsTemplates.length, 12);
            });
        });

        test('PowerShell v2', async () => {
            await runForTemplateSource(source, async (templates: TemplateProvider) => {
                const powershellTemplates: IFunctionTemplate[] = await templates.getTemplates(ProjectLanguage.PowerShell, ProjectRuntime.v2, testFolderPath, TemplateFilter.Verified);
                assert.equal(powershellTemplates.length, 9);
            });
        });
    });
}
