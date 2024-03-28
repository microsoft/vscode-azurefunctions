/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext, TestInput } from '@microsoft/vscode-azext-dev';
import { FuncVersion, JavaBuildTool, ProjectLanguage, TemplateSource } from '../../extension.bundle';
import { addParallelSuite, type ParallelTest } from '../addParallelSuite';
import { allTemplateSources, runForTemplateSource, shouldSkipVersion } from '../global.test';
import { createAndValidateProject, type ICreateProjectTestOptions } from './createAndValidateProject';
import { getCSharpValidateOptions, getCustomValidateOptions, getDotnetScriptValidateOptions, getFSharpValidateOptions, getJavaScriptValidateOptions, getJavaValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions } from './validateProject';

interface CreateProjectTestCase extends ICreateProjectTestOptions {
    description?: string;
}

const testCases: CreateProjectTestCase[] = [
    { ...getCSharpValidateOptions('netcoreapp2.1', FuncVersion.v2) },
    { ...getCSharpValidateOptions('netcoreapp3.1', FuncVersion.v3), inputs: [/3/], description: 'netcoreapp3.1' },
    { ...getCSharpValidateOptions('net6.0', FuncVersion.v4), inputs: [/6/], description: 'net6.0' },
    { ...getCSharpValidateOptions('net6.0', FuncVersion.v4), inputs: [/6.*isolated/i], description: 'net6.0 isolated' },
    { ...getCSharpValidateOptions('net7.0', FuncVersion.v4), inputs: [/7.*isolated/i], description: 'net7.0 isolated' },
    { ...getFSharpValidateOptions('netcoreapp2.1', FuncVersion.v2), isHiddenLanguage: true },
    { ...getFSharpValidateOptions('netcoreapp3.1', FuncVersion.v3), inputs: [/3/], isHiddenLanguage: true },
];

// Test cases that are the same for both v2 and v3
for (const version of [FuncVersion.v2, FuncVersion.v3, FuncVersion.v4]) {
    testCases.push(
        { ...getJavaScriptValidateOptions(true /* hasPackageJson */, version), inputs: ['Model V3'] },
        { ...getTypeScriptValidateOptions({ version }), inputs: ['Model V3'] },
        { ...getPowerShellValidateOptions(version) },
        { ...getDotnetScriptValidateOptions(ProjectLanguage.CSharpScript, version), isHiddenLanguage: true },
        { ...getDotnetScriptValidateOptions(ProjectLanguage.FSharpScript, version), isHiddenLanguage: true },
    );

    // test python v1 model
    testCases.push({
        ...getPythonValidateOptions('.venv', version),
        inputs: [/Model V1/i, TestInput.UseDefaultValue]
    });

    const appName: string = 'javaApp';
    const javaBaseInputs: (TestInput | string | RegExp)[] = [TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, appName];
    if (version !== FuncVersion.v2) { // v2 doesn't support picking a java version
        javaBaseInputs.unshift(/8/);
    }

    testCases.push({
        ...getJavaValidateOptions(appName, JavaBuildTool.gradle, version),
        inputs: javaBaseInputs.concat(/Gradle/i, /skip for now/i),
        description: JavaBuildTool.gradle
    });

    testCases.push({
        ...getJavaValidateOptions(appName, JavaBuildTool.maven, version),
        inputs: javaBaseInputs.concat(/Maven/i),
        description: JavaBuildTool.maven
    });
    /* Temporarily disable Ballerina tests until we can install Ballerina on the new pipelines
    const ballerinaBaseInputs: (TestInput | string | RegExp)[] = [/JVM/i];

    testCases.push({
        ...getBallerinaValidateOptions(version),
        inputs: ballerinaBaseInputs,
        description: 'ballerina'
    });
    */
}

testCases.push({ ...getCustomValidateOptions(FuncVersion.v3) });

const parallelTests: ParallelTest[] = [];
for (const testCase of testCases) {
    for (const source of allTemplateSources) {
        let title = `${testCase.language} ${testCase.version}`;
        if (testCase.description) {
            title += ` ${testCase.description}`;
        }
        title += ` (${source})`;

        parallelTests.push({
            title,
            // Java template provider based on maven, which does not support gradle project for now
            skip: shouldSkipVersion(testCase.version) || (testCase.description === JavaBuildTool.gradle && source !== TemplateSource.Backup),
            // lots of errors like "The process cannot access the file because it is being used by another process" 😢
            suppressParallel: [ProjectLanguage.FSharp, ProjectLanguage.CSharp, ProjectLanguage.Java].includes(testCase.language),
            callback: async () => {
                await runWithTestActionContext('createProject', async context => {
                    await runForTemplateSource(context, source, async () => {
                        await createAndValidateProject(context, testCase);
                    });
                });
            }
        })
    }
}

addParallelSuite(parallelTests, {
    title: 'Create New Project',
    timeoutMS: 2 * 60 * 1000
});
