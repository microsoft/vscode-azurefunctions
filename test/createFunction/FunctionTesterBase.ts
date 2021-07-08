/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { Disposable } from 'vscode';
import { runWithTestActionContext, TestActionContext } from 'vscode-azureextensiondev';
import { createFunctionInternal, FuncVersion, getRandomHexString, IFunctionTemplate, ProjectLanguage, TemplateFilter, TemplateSource } from '../../extension.bundle';
import { addParallelSuite, ParallelSuiteOptions, ParallelTest } from '../addParallelSuite';
import { runForTemplateSource, testFolderPath } from '../global.test';

export interface CreateFunctionTestCase {
    functionName: string;
    inputs: string[];
    skip?: boolean;
}

export abstract class FunctionTesterBase implements Disposable {
    public projectPath: string;
    public readonly version: FuncVersion;
    public abstract language: ProjectLanguage;

    private readonly testedFunctions: string[] = [];
    private _source: TemplateSource;

    public constructor(version: FuncVersion, source: TemplateSource) {
        this.version = version;
        this._source = source;
        this.projectPath = path.join(testFolderPath, getRandomHexString());
    }

    public get suiteName(): string {
        return `Create Function ${this.language} ${this.version} (${this._source})`;
    }

    /**
     * NOTE: The first entry in the returned array is used for validating contents
     */
    public abstract getExpectedPaths(functionName: string): string[];

    public async initAsync(): Promise<void> {
        await runWithTestActionContext('testCreateFunctionInit', async context => {
            await runForTemplateSource(context, this._source, async (templateProvider) => {
                await this.initializeTestFolder(this.projectPath);

                // This will initialize and cache the templatesTask for this project. Better to do it here than during the first test
                await templateProvider.getFunctionTemplates(context, this.projectPath, this.language, this.version, TemplateFilter.Verified, undefined);
            });
        });
    }

    public async dispose(): Promise<void> {
        await runWithTestActionContext('testCreateFunctionDispose', async context => {
            await runForTemplateSource(context, this._source, async (templateProvider) => {
                const templates: IFunctionTemplate[] = await templateProvider.getFunctionTemplates(context, this.projectPath, this.language, this.version, TemplateFilter.Verified, undefined);
                assert.deepEqual(this.testedFunctions.sort(), templates.map(t => t.name).sort(), 'Not all "Verified" templates were tested');
            });
        });
    }

    public addParallelSuite(testCases: CreateFunctionTestCase[], options?: Partial<ParallelSuiteOptions>): void {
        const parallelTests: ParallelTest[] = [];
        for (const testCase of testCases) {
            parallelTests.push({
                title: testCase.functionName,
                skip: testCase.skip,
                callback: async () => {
                    await this.testCreateFunction(testCase.functionName, ...testCase.inputs);
                }
            });
        }

        addParallelSuite(parallelTests, {
            title: this.suiteName,
            suiteSetup: async () => {
                await this.initAsync();
            },
            suiteTeardown: async () => {
                await this.dispose();
            },
            ...options
        });
    }

    public async testCreateFunction(templateName: string, ...inputs: string[]): Promise<void> {
        this.testedFunctions.push(templateName);
        await runWithTestActionContext('testCreateFunction', async context => {
            await runForTemplateSource(context, this._source, async () => {
                await this.testCreateFunctionInternal(context, this.projectPath, templateName, inputs.slice());
            });
        });
    }

    public async validateFunction(testFolder: string, funcName: string, expectedContents: string[]): Promise<void> {
        const expectedPaths: string[] = this.getExpectedPaths(funcName);
        for (const expectedPath of expectedPaths) {
            const filePath: string = path.join(testFolder, expectedPath);
            assert.ok(await fse.pathExists(filePath), `Failed to find expected path "${expectedPath}"`);
        }

        const mainFileName: string = expectedPaths[0];
        const mainFilePath: string = path.join(testFolder, mainFileName);
        const contents: string = (await fse.readFile(mainFilePath)).toString();
        for (const expectedContent of expectedContents) {
            assert.ok(contents.includes(expectedContent) || contents.includes(expectedContent.toLowerCase()), `Failed to find expected content "${expectedContent}" in "${mainFileName}"`);
        }
    }

    protected async initializeTestFolder(testFolder: string): Promise<void> {
        await fse.ensureDir(path.join(testFolder, '.vscode'));
        // Pretend to create the parent function project
        await Promise.all([
            fse.writeFile(path.join(testFolder, 'host.json'), '{}'),
            fse.writeFile(path.join(testFolder, 'local.settings.json'), '{ "Values": { "AzureWebJobsStorage": "test" } }'),
            fse.writeFile(path.join(testFolder, '.vscode', 'launch.json'), '')
        ]);
    }

    private async testCreateFunctionInternal(context: TestActionContext, testFolder: string, templateName: string, inputs: string[]): Promise<void> {
        // clone inputs array
        const expectedContents: string[] = inputs.slice(0);

        // Setup common inputs
        const funcName: string = templateName.replace(/[^a-z0-9]/ig, '') + getRandomHexString();
        inputs.unshift(funcName); // Specify the function name
        inputs.unshift(templateName); // Select the function template

        await context.ui.runWithInputs(inputs, async () => {
            await createFunctionInternal(context, {
                folderPath: testFolder,
                language: <any>this.language,
                version: this.version
            });
        });

        await this.validateFunction(testFolder, funcName, expectedContents);
    }
}
