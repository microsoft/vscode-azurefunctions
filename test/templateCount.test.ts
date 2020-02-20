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
import { CentralTemplateProvider, FuncVersion, IFunctionTemplate, ProjectLanguage, TemplateFilter, TemplateSource } from '../extension.bundle';
import { cleanTestWorkspace, createTestActionContext, longRunningTestsEnabled, runForTemplateSource, testUserInput, testWorkspacePath } from './global.test';

addSuite(undefined);
addSuite(TemplateSource.Latest);
addSuite(TemplateSource.Staging);
addSuite(TemplateSource.Backup);

function addSuite(source: TemplateSource | undefined): void {
    suite(`Template Count - ${source === undefined ? 'defaultOnExtensionActivation' : source}`, async () => {
        const cases: [ProjectLanguage, FuncVersion, number][] = [
            [ProjectLanguage.JavaScript, FuncVersion.v1, 8],
            [ProjectLanguage.JavaScript, FuncVersion.v2, 14],
            [ProjectLanguage.JavaScript, FuncVersion.v3, 14],
            [ProjectLanguage.CSharp, FuncVersion.v1, 12],
            [ProjectLanguage.CSharp, FuncVersion.v2, 9],
            [ProjectLanguage.CSharp, FuncVersion.v3, 9],
            [ProjectLanguage.Python, FuncVersion.v2, 9],
            [ProjectLanguage.Python, FuncVersion.v3, 9],
            [ProjectLanguage.TypeScript, FuncVersion.v2, 14],
            [ProjectLanguage.TypeScript, FuncVersion.v3, 14],
            [ProjectLanguage.PowerShell, FuncVersion.v2, 11],
            [ProjectLanguage.PowerShell, FuncVersion.v3, 11],
            [ProjectLanguage.Java, FuncVersion.v2, 4]
            // https://github.com/microsoft/vscode-azurefunctions/issues/1605
            // [ProjectLanguage.Java, FuncVersion.v3, 4]
        ];

        for (const [language, version, expectedCount] of cases) {
            test(`${language} ${version}`, async function (this: IHookCallbackContext): Promise<void> {
                if (language === ProjectLanguage.Java) {
                    await javaPreTest(this);
                }

                await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                    const templates: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), testWorkspacePath, language, version, TemplateFilter.Verified);
                    assert.equal(templates.length, expectedCount);
                });
            });
        }
    });
}

async function javaPreTest(testContext: IHookCallbackContext): Promise<void> {
    if (!longRunningTestsEnabled) {
        testContext.skip();
    }
    testContext.timeout(120 * 1000);

    // Java templates require you to have a project open, so create one here
    if (!await fse.pathExists(path.join(testWorkspacePath, 'pom.xml'))) { // No need to create for every template source
        const inputs: (string | TestInput | RegExp)[] = [testWorkspacePath, ProjectLanguage.Java, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, 'javaAppName'];
        await cleanTestWorkspace();
        await testUserInput.runWithInputs(inputs, async () => {
            await vscode.commands.executeCommand('azureFunctions.createNewProject');
        });
    }
}
