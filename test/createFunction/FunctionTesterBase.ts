/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { IActionContext, TestUserInput } from 'vscode-azureextensionui';
import { createFunction } from '../../src/commands/createFunction/createFunction';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter, templateFilterSetting } from '../../src/constants';
import { ext } from '../../src/extensionVariables';
import { getGlobalFuncExtensionSetting, updateGlobalSetting } from '../../src/ProjectSettings';
import * as fsUtil from '../../src/utils/fs';
import { runForAllTemplateSources } from '../global.test';

export abstract class FunctionTesterBase implements vscode.Disposable {
    public readonly baseTestFolder: string;

    protected abstract _language: ProjectLanguage;
    protected abstract _runtime: ProjectRuntime;

    private _oldTemplateFilter: string | undefined;
    private _oldProjectLanguage: string | undefined;
    private _oldProjectRuntime: string | undefined;

    constructor() {
        this.baseTestFolder = path.join(os.tmpdir(), `azFunc.createFuncTests${fsUtil.getRandomHexString()}`);
    }

    public async initAsync(): Promise<void> {
        this._oldTemplateFilter = getGlobalFuncExtensionSetting(templateFilterSetting);
        this._oldProjectLanguage = getGlobalFuncExtensionSetting(projectLanguageSetting);
        this._oldProjectRuntime = getGlobalFuncExtensionSetting(projectRuntimeSetting);

        await runForAllTemplateSources(async (source) => {
            await this.initializeTestFolder(path.join(this.baseTestFolder, source));
        });

        await updateGlobalSetting(templateFilterSetting, TemplateFilter.All);
        await updateGlobalSetting(projectLanguageSetting, this._language);
        await updateGlobalSetting(projectRuntimeSetting, this._runtime);
    }

    public async dispose(): Promise<void> {
        await fse.remove(this.baseTestFolder);

        await updateGlobalSetting(templateFilterSetting, this._oldTemplateFilter);
        await updateGlobalSetting(projectLanguageSetting, this._oldProjectLanguage);
        await updateGlobalSetting(projectRuntimeSetting, this._oldProjectRuntime);
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
        await createFunction(<IActionContext>{ properties: {}, measurements: {} });
        assert.equal(inputs.length, 0, 'Not all inputs were used.');

        await this.validateFunction(testFolder, funcName);
    }
}
