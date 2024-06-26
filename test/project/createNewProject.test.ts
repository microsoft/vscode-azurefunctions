/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithTestActionContext, TestInput } from '@microsoft/vscode-azext-dev';
import { FuncVersion, JavaBuildTool, ProjectLanguage, TemplateSource } from '../../extension.bundle';
import { addParallelSuite, type ParallelTest } from '../addParallelSuite';
import { backupLatestTemplateSources, runForTemplateSource, shouldSkipVersion } from '../global.test';
import { createAndValidateProject, type ICreateProjectTestOptions } from './createAndValidateProject';
import { getCSharpValidateOptions, getCustomValidateOptions, getDotnetScriptValidateOptions, getJavaScriptValidateOptions, getJavaValidateOptions, getPowerShellValidateOptions, getPythonValidateOptions, getTypeScriptValidateOptions, NodeModelVersion, PythonModelVersion } from './validateProject';

interface CreateProjectTestCase extends ICreateProjectTestOptions {
    description?: string;
    modelVersion?: PythonModelVersion | NodeModelVersion;
}

const testCases: CreateProjectTestCase[] = [
    { ...getCSharpValidateOptions('net6.0', FuncVersion.v4), inputs: [/6/], description: 'net6.0' },
    { ...getCSharpValidateOptions('net6.0', FuncVersion.v4), inputs: [/6.*isolated/i], description: 'net6.0 isolated' },
    { ...getCSharpValidateOptions('net7.0', FuncVersion.v4), inputs: [/7.*isolated/i], description: 'net7.0 isolated' },

];

// Test cases that are the same for both v2 and v3

testCases.push(
    { ...getJavaScriptValidateOptions(true /* hasPackageJson */, FuncVersion.v4), inputs: ['Model V3'], modelVersion: NodeModelVersion.v3 },
    { ...getJavaScriptValidateOptions(true /* hasPackageJson */, FuncVersion.v4, undefined, undefined, NodeModelVersion.v4), inputs: ['Model V4'], modelVersion: NodeModelVersion.v4 },
    { ...getTypeScriptValidateOptions({ version: FuncVersion.v4 }), inputs: ['Model V3'], modelVersion: NodeModelVersion.v3 },
    { ...getTypeScriptValidateOptions({ version: FuncVersion.v4, modelVersion: NodeModelVersion.v4 }), inputs: ['Model V4'], modelVersion: NodeModelVersion.v4 },
    { ...getPowerShellValidateOptions(FuncVersion.v4) },
    { ...getDotnetScriptValidateOptions(ProjectLanguage.CSharpScript, FuncVersion.v4), isHiddenLanguage: true },
    { ...getDotnetScriptValidateOptions(ProjectLanguage.FSharpScript, FuncVersion.v4), isHiddenLanguage: true },
);

// test python v1 model
testCases.push({
    ...getPythonValidateOptions('.venv', FuncVersion.v4),
    inputs: [/Model V1/i, TestInput.UseDefaultValue],
    modelVersion: PythonModelVersion.v1
});

// test python v2 model
testCases.push({
    ...getPythonValidateOptions('.venv', FuncVersion.v4, PythonModelVersion.v2),
    inputs: [/Model V2/i, TestInput.UseDefaultValue],
    modelVersion: PythonModelVersion.v2
});

const appName: string = 'javaApp';
const javaBaseInputs: (TestInput | string | RegExp)[] = [/8/, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, TestInput.UseDefaultValue, appName];


testCases.push({
    ...getJavaValidateOptions(appName, JavaBuildTool.gradle, FuncVersion.v4),
    inputs: javaBaseInputs.concat(/Gradle/i, /skip for now/i),
    description: JavaBuildTool.gradle
});

testCases.push({
    ...getJavaValidateOptions(appName, JavaBuildTool.maven, FuncVersion.v4),
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


testCases.push({ ...getCustomValidateOptions(FuncVersion.v4) });

const parallelTests: ParallelTest[] = [];
for (const testCase of testCases) {
    for (const source of backupLatestTemplateSources) {
        let title = `${testCase.language} ${testCase.version}`;
        if (testCase.description) {
            title += ` ${testCase.description}`;
        }
        if (testCase.modelVersion) {
            title += `(${testCase.modelVersion})`
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
