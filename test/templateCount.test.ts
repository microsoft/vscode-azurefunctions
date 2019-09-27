/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { IHookCallbackContext } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestInput } from 'vscode-azureextensiondev';
import { CentralTemplateProvider, IFunctionTemplate, ProjectLanguage, ProjectRuntime, TemplateFilter, TemplateSource } from '../extension.bundle';
import { createTestActionContext, longRunningTestsEnabled, runForTemplateSource, testUserInput, testWorkspacePath } from './global.test';

addSuite(undefined);
addSuite(TemplateSource.Latest);
addSuite(TemplateSource.Staging);
addSuite(TemplateSource.Backup);

function addSuite(source: TemplateSource | undefined): void {
    suite(`Template Count - ${source === undefined ? 'defaultOnExtensionActivation' : source}`, async () => {
        test('JavaScript v1', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const jsTemplatesv1: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), undefined, ProjectLanguage.JavaScript, ProjectRuntime.v1, TemplateFilter.Verified);
                assert.equal(jsTemplatesv1.length, 8);
            });
        });

        test('JavaScript v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const jsTemplatesv2: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), undefined, ProjectLanguage.JavaScript, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(jsTemplatesv2.length, 12);
            });
        });

        test('Java v2', async function (this: IHookCallbackContext): Promise<void> {
            if (!longRunningTestsEnabled) {
                this.skip();
            }
            this.timeout(120 * 1000);

            // Java templates require you to have a project open, so create one here
            if (!await fse.pathExists(path.join(testWorkspacePath, 'pom.xml'))) { // No need to create for every template source
                const inputs: (string | TestInput | RegExp)[] = [testWorkspacePath, ProjectLanguage.Java, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, 'javaAppName'];
                await fse.emptyDir(testWorkspacePath);
                await testUserInput.runWithInputs(inputs, async () => {
                    await vscode.commands.executeCommand('azureFunctions.createNewProject');
                });
            }

            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const javaTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), testWorkspacePath, ProjectLanguage.Java, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(javaTemplates.length, 4);
            });
        });

        test('C# v1', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const cSharpTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), undefined, ProjectLanguage.CSharp, ProjectRuntime.v1, TemplateFilter.Verified);
                assert.equal(cSharpTemplates.length, 12);
            });
        });

        test('C# v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const cSharpTemplatesv2: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), undefined, ProjectLanguage.CSharp, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(cSharpTemplatesv2.length, 9);
            });
        });

        test('Python v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const pythonTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), undefined, ProjectLanguage.Python, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(pythonTemplates.length, 9);
            });
        });

        test('TypeScript v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const tsTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), undefined, ProjectLanguage.TypeScript, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(tsTemplates.length, 12);
            });
        });

        test('PowerShell v2', async () => {
            await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                const powershellTemplates: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), undefined, ProjectLanguage.PowerShell, ProjectRuntime.v2, TemplateFilter.Verified);
                assert.equal(powershellTemplates.length, 9);
            });
        });
    });
}
