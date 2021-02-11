/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CentralTemplateProvider, FuncVersion, IFunctionTemplate, ProjectLanguage, TemplateFilter, TemplateSource } from '../extension.bundle';
import { createTestActionContext, longRunningTestsEnabled, runForTemplateSource, skipStagingTemplateSource, testWorkspacePath } from './global.test';
import { javaUtils } from './utils/javaUtils';

addSuite(undefined);
addSuite(TemplateSource.Latest);
addSuite(TemplateSource.Staging);
addSuite(TemplateSource.Backup);

function addSuite(source: TemplateSource | undefined): void {
    suite(`Template Count - ${source === undefined ? 'defaultOnExtensionActivation' : source}`, () => {
        const cases: [ProjectLanguage, FuncVersion, number][] = [
            [ProjectLanguage.JavaScript, FuncVersion.v1, 8],
            [ProjectLanguage.JavaScript, FuncVersion.v2, 14],
            [ProjectLanguage.JavaScript, FuncVersion.v3, 14],
            [ProjectLanguage.CSharp, FuncVersion.v1, 12],
            [ProjectLanguage.CSharp, FuncVersion.v2, 10],
            [ProjectLanguage.CSharp, FuncVersion.v3, 11],
            [ProjectLanguage.Python, FuncVersion.v2, 12],
            [ProjectLanguage.Python, FuncVersion.v3, 12],
            [ProjectLanguage.TypeScript, FuncVersion.v2, 14],
            [ProjectLanguage.TypeScript, FuncVersion.v3, 14],
            [ProjectLanguage.PowerShell, FuncVersion.v2, 14],
            [ProjectLanguage.PowerShell, FuncVersion.v3, 14],
            [ProjectLanguage.Java, FuncVersion.v2, 4]
            // https://github.com/microsoft/vscode-azurefunctions/issues/1605
            // [ProjectLanguage.Java, FuncVersion.v3, 4]
        ];

        for (const [language, version, expectedCount] of cases) {
            test(`${language} ${version}`, async function (this: Mocha.Context): Promise<void> {
                if (source === TemplateSource.Staging && skipStagingTemplateSource) {
                    this.skip();
                }

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

async function javaPreTest(testContext: Mocha.Context): Promise<void> {
    if (!longRunningTestsEnabled) {
        testContext.skip();
    }
    testContext.timeout(120 * 1000);

    await javaUtils.addJavaProjectToWorkspace();
}
