/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestInput } from 'vscode-azureextensiondev';
import { FuncVersion, ProjectLanguage } from '../../extension.bundle';
import { allTemplateSources, cleanTestWorkspace, longRunningTestsEnabled, runForTemplateSource } from '../global.test';
import { createAndValidateProject, ICreateProjectTestOptions } from './createAndValidateProject';
import { getCSharpValidateOptions, getCustomValidateOptions, getDotnetScriptValidateOptions, getFSharpValidateOptions, getJavaScriptValidateOptions, getJavaValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions } from './validateProject';

suite('Create New Project', () => {
    suiteSetup(async () => {
        await cleanTestWorkspace();
    });

    const testCases: ICreateProjectTestCase[] = [
        { ...getCSharpValidateOptions('C#Project', 'netcoreapp2.1', FuncVersion.v2) },
        { ...getCSharpValidateOptions('C#Project', 'netcoreapp3.1', FuncVersion.v3), inputs: [/3/], description: 'netcoreapp3.1' },
        { ...getCSharpValidateOptions('C#Project', 'net5.0', FuncVersion.v3), inputs: [/5/], description: 'net5.0 isolated' },
        { ...getFSharpValidateOptions('F#Project', 'netcoreapp2.1', FuncVersion.v2), isHiddenLanguage: true },
        { ...getFSharpValidateOptions('F#Project', 'netcoreapp3.1', FuncVersion.v3), inputs: [/3/], isHiddenLanguage: true },
    ];

    // Test cases that are the same for both v2 and v3
    for (const version of [FuncVersion.v2, FuncVersion.v3]) {
        testCases.push(
            { ...getJavaScriptValidateOptions(true /* hasPackageJson */, version) },
            { ...getTypeScriptValidateOptions(version) },
            { ...getPowerShellValidateOptions(version), timeout: 60 * 1000 },
            { ...getDotnetScriptValidateOptions(ProjectLanguage.CSharpScript, version), isHiddenLanguage: true },
            { ...getDotnetScriptValidateOptions(ProjectLanguage.FSharpScript, version), isHiddenLanguage: true },
        );

        testCases.push({
            ...getPythonValidateOptions('.venv', version),
            timeout: 2 * 60 * 1000,
            inputs: [/3\.7/]
        });

        const appName: string = 'javaApp';
        const javaInputs: (TestInput | string | RegExp)[] = [TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, appName];
        if (version !== FuncVersion.v2) { // v2 doesn't support picking a java version
            javaInputs.unshift(/11/);
        }
        testCases.push({
            ...getJavaValidateOptions(appName, version),
            timeout: 5 * 60 * 1000,
            inputs: javaInputs
        });
    }

    testCases.push({ ...getCustomValidateOptions(FuncVersion.v3) });

    for (const testCase of testCases) {
        addTest(testCase);
    }
});

interface ICreateProjectTestCase extends ICreateProjectTestOptions {
    timeout?: number;
    description?: string;
}

function addTest(testCase: ICreateProjectTestCase): void {
    for (const source of allTemplateSources) {
        let testName = `${testCase.language} ${testCase.version}`;
        if (testCase.description) {
            testName += ` ${testCase.description}`;
        }
        testName += ` (${source})`
        test(testName, async function (this: Mocha.Context): Promise<void> {
            if (testCase.timeout !== undefined) {
                if (longRunningTestsEnabled) {
                    this.timeout(testCase.timeout);
                } else {
                    this.skip();
                }
            }

            await runForTemplateSource(source, async () => {
                await createAndValidateProject(testCase);
            });
        });
    }
}
