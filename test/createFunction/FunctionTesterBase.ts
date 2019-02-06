/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext, getRandomHexString, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter, templateFilterSetting, TestUserInput } from '../../extension.bundle';
import { runForAllTemplateSources } from '../global.test';
import { runWithSetting } from '../runWithSetting';

export abstract class FunctionTesterBase implements vscode.Disposable {
    public readonly baseTestFolder: string;

    protected abstract _language: ProjectLanguage;
    protected abstract _runtime: ProjectRuntime;

    constructor() {
        this.baseTestFolder = path.join(os.tmpdir(), `azFunc.createFuncTests${getRandomHexString()}`);
    }

    public async initAsync(): Promise<void> {
        await runForAllTemplateSources(async (source) => {
            await this.initializeTestFolder(path.join(this.baseTestFolder, source));
        });
    }

    public async dispose(): Promise<void> {
        await fse.remove(this.baseTestFolder);
    }

    public async testCreateFunction(templateName: string, ...inputs: (string | undefined)[]): Promise<void> {
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

    private async testCreateFunctionInternal(testFolder: string, templateName: string, inputs: (string | undefined)[]): Promise<void> {
        // Setup common inputs
        const funcName: string = templateName.replace(/ /g, '');
        inputs.unshift(funcName); // Specify the function name
        inputs.unshift(templateName); // Select the function template
        inputs.unshift(testFolder); // Select the test func app folder
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            inputs.unshift('$(file-directory) Browse...'); // If the test environment has an open workspace, select the 'Browse...' option
        }

        ext.ui = new TestUserInput(inputs);
        await runWithSetting(templateFilterSetting, TemplateFilter.All, async () => {
            await runWithSetting(projectLanguageSetting, this._language, async () => {
                await runWithSetting(projectRuntimeSetting, this._runtime, async () => {
                    await vscode.commands.executeCommand('azureFunctions.createFunction');
                });
            });
        });
        assert.equal(inputs.length, 0, 'Not all inputs were used.');

        await this.validateFunction(testFolder, funcName);
    }
}
