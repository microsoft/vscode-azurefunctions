/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import * as assert from 'assert';
import { FuncVersion, ProjectLanguage, TemplateFilter, TemplateSource, type CentralTemplateProvider, type FunctionTemplateBase } from '../extension.bundle';
import { getTestWorkspaceFolder, longRunningTestsEnabled, runForTemplateSource, shouldSkipVersion } from './global.test';
import { javaUtils } from './utils/javaUtils';

addSuite(undefined);
addSuite(TemplateSource.Latest);
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
            { language: ProjectLanguage.JavaScript, version: FuncVersion.v4, expectedCount: 18 },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v1, expectedCount: 12 },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v4, expectedCount: 15, projectTemplateKey: 'net6.0' },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v4, expectedCount: 13, projectTemplateKey: 'net6.0-isolated' },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v4, expectedCount: 13, projectTemplateKey: 'net7.0-isolated' },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v4, expectedCount: 13, projectTemplateKey: 'net8.0-isolated' },
            { language: ProjectLanguage.Python, version: FuncVersion.v4, expectedCount: 14 },
            { language: ProjectLanguage.TypeScript, version: FuncVersion.v4, expectedCount: 18 },
            { language: ProjectLanguage.PowerShell, version: FuncVersion.v4, expectedCount: 16 },
            { language: ProjectLanguage.Ballerina, version: FuncVersion.v4, expectedCount: 5 }
        ];

        let testWorkspacePath: string;
        suiteSetup(async () => {
            testWorkspacePath = getTestWorkspaceFolder();
        });

        for (const { language, version, expectedCount, projectTemplateKey } of cases) {
            let testName: string = `${language} ${version}`;
            if (projectTemplateKey) {
                testName += ` ${projectTemplateKey}`;
            }
            test(testName, async function (this: Mocha.Context): Promise<void> {
                if (shouldSkipVersion(version)) {
                    this.skip();
                }

                if (language === ProjectLanguage.Java) {
                    await javaPreTest(this, testWorkspacePath);
                }

                await runWithTestActionContext('getFunctionTemplates', async context => {
                    await runForTemplateSource(context, source, async (provider: CentralTemplateProvider) => {
                        const templates: FunctionTemplateBase[] = await provider.getFunctionTemplates(context, testWorkspacePath, language, undefined, version, TemplateFilter.Verified, projectTemplateKey);
                        assert.equal(templates.length, expectedCount);
                    });
                });
            });
        }
    });
}

async function javaPreTest(testContext: Mocha.Context, testWorkspacePath: string): Promise<void> {
    if (!longRunningTestsEnabled) {
        testContext.skip();
    }
    testContext.timeout(120 * 1000);

    await javaUtils.addJavaProjectToWorkspace(testWorkspacePath);
}
