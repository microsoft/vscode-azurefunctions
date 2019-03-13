/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter, templateFilterSetting, TestInput, TestUserInput } from '../../extension.bundle';
import { runForAllTemplateSources, testFolderPath } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';

export abstract class FunctionTesterBase {
    public baseTestFolder: string;

    public abstract language: ProjectLanguage;
    public abstract runtime: ProjectRuntime;

    public async initAsync(): Promise<void> {
        this.baseTestFolder = path.join(testFolderPath, `createFunction${this.language}${this.runtime}`);
        await runForAllTemplateSources(async (source) => {
            await this.initializeTestFolder(path.join(this.baseTestFolder, source));
        });
    }

    public async testCreateFunction(templateName: string, ...inputs: (string | TestInput)[]): Promise<void> {
        await runForAllTemplateSources(async (source) => {
            await this.testCreateFunctionInternal(path.join(this.baseTestFolder, source), templateName, inputs.slice());
        });
    }

    public abstract async validateFunction(testFolder: string, funcName: string): Promise<void>;

    private async initializeTestFolder(testFolder: string): Promise<void> {
        await fse.ensureDir(path.join(testFolder, '.vscode'));
        // Pretend to create the parent function app
        await Promise.all([
            fse.writeFile(path.join(testFolder, 'host.json'), ''),
            fse.writeFile(path.join(testFolder, 'local.settings.json'), '{ "Values": { "AzureWebJobsStorage": "test" } }'),
            fse.writeFile(path.join(testFolder, '.vscode', 'launch.json'), '')
        ]);
    }

    private async testCreateFunctionInternal(testFolder: string, templateName: string, inputs: (string | TestInput)[]): Promise<void> {
        // Setup common inputs
        const funcName: string = templateName.replace(/ /g, '');
        inputs.unshift(funcName); // Specify the function name
        inputs.unshift(templateName); // Select the function template
        inputs.unshift(testFolder); // Select the test func app folder
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            inputs.unshift('$(file-directory) Browse...'); // If the test environment has an open workspace, select the 'Browse...' option
        }

        ext.ui = new TestUserInput(inputs);
        await runWithFuncSetting(templateFilterSetting, TemplateFilter.All, async () => {
            await runWithFuncSetting(projectLanguageSetting, this.language, async () => {
                await runWithFuncSetting(projectRuntimeSetting, this.runtime, async () => {
                    await vscode.commands.executeCommand('azureFunctions.createFunction');
                });
            });
        });
        assert.equal(inputs.length, 0, `Not all inputs were used: ${inputs}`);

        await this.validateFunction(testFolder, funcName);
    }
}
