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

interface TestCase {
    language: ProjectLanguage;
    version: FuncVersion;
    expectedCount: number;
    projectTemplateKey?: string;
}

function addSuite(source: TemplateSource | undefined): void {
    suite(`Template Count - ${source === undefined ? 'defaultOnExtensionActivation' : source}`, () => {
        const cases: TestCase[] = [
            { language: ProjectLanguage.JavaScript, version: FuncVersion.v1, expectedCount: 8 },
            { language: ProjectLanguage.JavaScript, version: FuncVersion.v2, expectedCount: 14 },
            { language: ProjectLanguage.JavaScript, version: FuncVersion.v3, expectedCount: 14 },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v1, expectedCount: 12 },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v2, expectedCount: 10 },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v3, expectedCount: 11 },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v3, expectedCount: 9, projectTemplateKey: 'net5.0-isolated' },
            { language: ProjectLanguage.Python, version: FuncVersion.v2, expectedCount: 12 },
            { language: ProjectLanguage.Python, version: FuncVersion.v3, expectedCount: 12 },
            { language: ProjectLanguage.TypeScript, version: FuncVersion.v2, expectedCount: 14 },
            { language: ProjectLanguage.TypeScript, version: FuncVersion.v3, expectedCount: 14 },
            { language: ProjectLanguage.PowerShell, version: FuncVersion.v2, expectedCount: 14 },
            { language: ProjectLanguage.PowerShell, version: FuncVersion.v3, expectedCount: 14 },
            { language: ProjectLanguage.Java, version: FuncVersion.v2, expectedCount: 4 }
            // https://github.com/microsoft/vscode-azurefunctions/issues/1605
            // { language: ProjectLanguage.Java, version: FuncVersion.v3, expectedCount: 4}]
        ];

        for (const { language, version, expectedCount, projectTemplateKey } of cases) {
            let testName: string = `${language} ${version}`;
            if (projectTemplateKey) {
                testName += ` ${projectTemplateKey}`;
            }
            test(testName, async function (this: Mocha.Context): Promise<void> {
                if (source === TemplateSource.Staging && skipStagingTemplateSource) {
                    this.skip();
                }

                if (language === ProjectLanguage.Java) {
                    await javaPreTest(this);
                }

                await runForTemplateSource(source, async (provider: CentralTemplateProvider) => {
                    const templates: IFunctionTemplate[] = await provider.getFunctionTemplates(createTestActionContext(), testWorkspacePath, language, version, TemplateFilter.Verified, projectTemplateKey);
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
