/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import { Disposable } from 'vscode';
import { createFunction, ext, FuncVersion, funcVersionSetting, IFunctionTemplate, ProjectLanguage, projectLanguageSetting, TemplateFilter, templateFilterSetting } from '../../extension.bundle';
import { createTestActionContext, runForAllTemplateSources, testFolderPath, testUserInput } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';

export abstract class FunctionTesterBase implements Disposable {
    public baseTestFolder: string;
    public readonly version: FuncVersion;
    public abstract language: ProjectLanguage;

    private readonly testedFunctions: string[] = [];

    public constructor(version: FuncVersion) {
        this.version = version;
    }

    /**
     * NOTE: The first entry in the returned array is used for validating contents
     */
    public abstract getExpectedPaths(functionName: string): string[];

    public async initAsync(): Promise<void> {
        this.baseTestFolder = path.join(testFolderPath, `createFunction${this.language}${this.version}`);
        await runForAllTemplateSources(async (source) => {
            await this.initializeTestFolder(path.join(this.baseTestFolder, source));
        });
    }

    public async dispose(): Promise<void> {
        const templates: IFunctionTemplate[] = await ext.templateProvider.getFunctionTemplates(createTestActionContext(), this.baseTestFolder, this.language, this.version, TemplateFilter.Verified);
        assert.deepEqual(this.testedFunctions.sort(), templates.map(t => t.name).sort(), 'Not all "Verified" templates were tested');
    }

    public async testCreateFunction(templateName: string, ...inputs: string[]): Promise<void> {
        this.testedFunctions.push(templateName);
        await runForAllTemplateSources(async (source) => {
            await this.testCreateFunctionInternal(path.join(this.baseTestFolder, source), templateName, inputs.slice());
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

    private async initializeTestFolder(testFolder: string): Promise<void> {
        await fse.ensureDir(path.join(testFolder, '.vscode'));
        // Pretend to create the parent function project
        await Promise.all([
            fse.writeFile(path.join(testFolder, 'host.json'), '{}'),
            fse.writeFile(path.join(testFolder, 'local.settings.json'), '{ "Values": { "AzureWebJobsStorage": "test" } }'),
            fse.writeFile(path.join(testFolder, '.vscode', 'launch.json'), '')
        ]);
    }

    private async testCreateFunctionInternal(testFolder: string, templateName: string, inputs: string[]): Promise<void> {
        // clone inputs array
        const expectedContents: string[] = inputs.slice(0);

        // Setup common inputs
        const funcName: string = templateName.replace(/ /g, '');
        inputs.unshift(funcName); // Specify the function name
        inputs.unshift(templateName); // Select the function template

        await testUserInput.runWithInputs(inputs, async () => {
            await runWithFuncSetting(templateFilterSetting, TemplateFilter.Verified, async () => {
                await runWithFuncSetting(projectLanguageSetting, this.language, async () => {
                    await runWithFuncSetting(funcVersionSetting, this.version, async () => {
                        await createFunction(createTestActionContext(), testFolder);
                    });
                });
            });
        });

        await this.validateFunction(testFolder, funcName, expectedContents);
    }
}
