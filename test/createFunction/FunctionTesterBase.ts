/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { IHookCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceConfiguration } from 'vscode';
import { createFunction } from '../../src/commands/createFunction/createFunction';
import { extensionPrefix, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter, templateFilterSetting } from '../../src/ProjectSettings';
import { TemplateData } from '../../src/templates/TemplateData';
import * as fsUtil from '../../src/utils/fs';
import { TestAzureAccount } from '../TestAzureAccount';
import { TestUI } from '../TestUI';

const templateData: TemplateData = new TemplateData();

// tslint:disable-next-line:no-function-expression
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(15 * 1000);
    // Ensure template data is initialized before any 'Create Function' test is run
    await templateData.getTemplates('fakeProjectPath', 'JavaScript');
});

export abstract class FunctionTesterBase implements vscode.Disposable {
    public testFolder: string;
    public outputChannel: vscode.OutputChannel;

    protected abstract _language: ProjectLanguage;
    protected abstract _runtime: ProjectRuntime;

    private _projectConfiguration: WorkspaceConfiguration;
    private _oldTemplateFilter: string | undefined;
    private _oldProjectLanguage: string | undefined;
    private _oldProjectRuntime: string | undefined;

    constructor() {
        this.testFolder = path.join(os.tmpdir(), `azFunc.createFuncTests${fsUtil.getRandomHexString()}`);
        this.outputChannel = vscode.window.createOutputChannel('Azure Functions Test');
        this._projectConfiguration = vscode.workspace.getConfiguration(extensionPrefix);
    }

    public async initAsync(): Promise<void> {
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        this._oldTemplateFilter = this._projectConfiguration.get(templateFilterSetting);
        this._oldProjectLanguage = this._projectConfiguration.get(projectLanguageSetting);
        this._oldProjectRuntime = this._projectConfiguration.get(projectRuntimeSetting);

        await fse.ensureDir(path.join(this.testFolder, '.vscode'));
        // Pretend to create the parent function app
        await Promise.all([
            fse.writeFile(path.join(this.testFolder, 'host.json'), ''),
            fse.writeFile(path.join(this.testFolder, 'local.settings.json'), '{ "Values": { "AzureWebJobsStorage": "test" } }'),
            fse.writeFile(path.join(this.testFolder, '.vscode', 'launch.json'), '')
        ]);

        await this._projectConfiguration.update(templateFilterSetting, TemplateFilter.All, vscode.ConfigurationTarget.Global);
        await this._projectConfiguration.update(projectLanguageSetting, this._language, vscode.ConfigurationTarget.Global);
        await this._projectConfiguration.update(projectRuntimeSetting, this._runtime, vscode.ConfigurationTarget.Global);
    }

    public async dispose(): Promise<void> {
        this.outputChannel.dispose();
        await fse.remove(this.testFolder);

        await this._projectConfiguration.update(templateFilterSetting, this._oldTemplateFilter, vscode.ConfigurationTarget.Global);
        await this._projectConfiguration.update(projectLanguageSetting, this._oldProjectLanguage, vscode.ConfigurationTarget.Global);
        await this._projectConfiguration.update(projectRuntimeSetting, this._oldProjectRuntime, vscode.ConfigurationTarget.Global);
    }

    public async testCreateFunction(templateName: string, ...inputs: (string | undefined)[]): Promise<void> {
        // Setup common inputs
        const funcName: string = templateName.replace(/ /g, '');
        inputs.unshift(funcName); // Specify the function name
        inputs.unshift(templateName); // Select the function template
        inputs.unshift(this.testFolder); // Select the test func app folder
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            inputs.unshift('$(file-directory) Browse...'); // If the test environment has an open workspace, select the 'Browse...' option
        }

        const ui: TestUI = new TestUI(inputs);
        await createFunction({}, this.outputChannel, new TestAzureAccount(), templateData, ui);
        assert.equal(inputs.length, 0, 'Not all inputs were used.');

        await this.validateFunction(funcName);
    }

    public abstract async validateFunction(funcName: string): Promise<void>;
}
