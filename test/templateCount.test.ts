/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IHookCallbackContext } from 'mocha';
import { CentralTemplateProvider, IFunctionTemplate, ProjectLanguage, ProjectRuntime, TemplateFilter, TemplateSource } from '../extension.bundle';
import { longRunningTestsEnabled, runForTemplateSource, testActionContext } from './global.test';

addSuite(undefined);
addSuite(TemplateSource.Latest);
addSuite(TemplateSource.Staging);
addSuite(TemplateSource.Backup);

function addSuite(source: TemplateSource | undefined): void {
    suite(`Template Count - ${source === undefined ? 'defaultOnExtensionActivation' : source}`, async () => {
        test('JavaScript v1', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const jsTemplatesv1: IFunctionTemplate[] = await provider.getFunctionTemplates(testActionContext, ProjectLanguage.JavaScript, ProjectRuntime.v1, TemplateFilter.Verified);
                assert.equal(jsTemplatesv1.length, 8);
            });
        });

        test('JavaScript v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const jsTemplatesv2: IFunctionTemplate[] = await provider.getFunctionTemplates(testActionContext, ProjectLanguage.JavaScript, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(jsTemplatesv2.length, 12);
            });
        });

        test('Java v2', async function (this: IHookCallbackContext): Promise<void> {
            if (!longRunningTestsEnabled) {
                this.skip();
            }
            this.timeout(60 * 1000);

            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const javaTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(testActionContext, ProjectLanguage.Java, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(javaTemplates.length, 4);
            });
        });

        test('C# v1', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const cSharpTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(testActionContext, ProjectLanguage.CSharp, ProjectRuntime.v1, TemplateFilter.Verified);
                assert.equal(cSharpTemplates.length, 12);
            });
        });

        test('C# v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const cSharpTemplatesv2: IFunctionTemplate[] = await provider.getFunctionTemplates(testActionContext, ProjectLanguage.CSharp, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(cSharpTemplatesv2.length, 9);
            });
        });

        test('Python v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const pythonTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(testActionContext, ProjectLanguage.Python, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(pythonTemplates.length, 9);
            });
        });

        test('TypeScript v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const tsTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(testActionContext, ProjectLanguage.TypeScript, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(tsTemplates.length, 12);
            });
        });

        test('PowerShell v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const powershellTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(testActionContext, ProjectLanguage.PowerShell, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(powershellTemplates.length, 9);
            });
        });
    });
}
