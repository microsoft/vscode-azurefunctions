/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import * as assert from 'assert';
import { ProjectLanguage, TemplateFilter } from '../src/constants';
import { TemplateSource } from '../src/extensionVariables';
import { FuncVersion } from '../src/FuncVersion';
import { type FunctionTemplateBase } from '../src/templates/IFunctionTemplate';
import { getTestWorkspaceFolder, longRunningTestsEnabled, shouldSkipVersion } from './global.test';
import { javaUtils } from './utils/javaUtils';
import { getCachedTestApi, getTestApi } from './utils/testApiAccess';

addSuite(undefined);
addSuite(TemplateSource.Latest);
addSuite(TemplateSource.Backup);

interface TestCase {
    language: ProjectLanguage;
    version: FuncVersion;
    expectedCount: number;
    /** If provided, used as expected count when source is Backup (some templates like McpToolTrigger are not in Backup) */
    backupExpectedCount?: number;
    projectTemplateKey?: string;
}

function addSuite(source: TemplateSource | undefined): void {
    suite(`Template Count - ${source === undefined ? 'defaultOnExtensionActivation' : source}`, () => {
        const cases: TestCase[] = [
            { language: ProjectLanguage.JavaScript, version: FuncVersion.v1, expectedCount: 8 },
            { language: ProjectLanguage.JavaScript, version: FuncVersion.v4, expectedCount: 18 },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v1, expectedCount: 12 },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v4, expectedCount: 15, projectTemplateKey: 'net6.0' },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v4, expectedCount: 14, backupExpectedCount: 13, projectTemplateKey: 'net6.0-isolated' },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v4, expectedCount: 14, backupExpectedCount: 13, projectTemplateKey: 'net7.0-isolated' },
            { language: ProjectLanguage.CSharp, version: FuncVersion.v4, expectedCount: 14, backupExpectedCount: 13, projectTemplateKey: 'net8.0-isolated' },
            { language: ProjectLanguage.Python, version: FuncVersion.v4, expectedCount: 15 },
            { language: ProjectLanguage.TypeScript, version: FuncVersion.v4, expectedCount: 18 },
            { language: ProjectLanguage.PowerShell, version: FuncVersion.v4, expectedCount: 16 },
            { language: ProjectLanguage.Ballerina, version: FuncVersion.v4, expectedCount: 5 }
        ];

        let testWorkspacePath: string;
        suiteSetup(async () => {
            await getTestApi();
            testWorkspacePath = getTestWorkspaceFolder();
        });

        for (const { language, version, expectedCount, backupExpectedCount, projectTemplateKey } of cases) {
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
                    const testApi = getCachedTestApi();
                    const allTemplates: FunctionTemplateBase[] = await testApi.commands.getFunctionTemplates(
                        context, testWorkspacePath, language, undefined, version, TemplateFilter.Verified, projectTemplateKey, source
                    );
                    // getFunctionTemplates now returns all templates with templateFilter set as a category.
                    // Filter to Verified here to validate both the total return and correct classification.
                    const templates = allTemplates.filter(t => t.templateFilter === TemplateFilter.Verified);
                    const expected = source === TemplateSource.Backup && backupExpectedCount !== undefined ? backupExpectedCount : expectedCount;
                    assert.equal(templates.length, expected);
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
