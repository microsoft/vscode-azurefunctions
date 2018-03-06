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
import { createFunction } from '../../src/commands/createFunction/createFunction';
import { getGlobalFuncExtensionSetting, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter, templateFilterSetting, updateGlobalSetting } from '../../src/ProjectSettings';
import { getTemplateDataFromBackup, TemplateData, tryGetTemplateDataFromFuncPortal } from '../../src/templates/TemplateData';
import * as fsUtil from '../../src/utils/fs';
import { TestAzureAccount } from '../TestAzureAccount';
import { TestUI } from '../TestUI';

let backupTemplateData: TemplateData;
let funcPortalTemplateData: TemplateData | undefined;
let funcStagingPortalTemplateData: TemplateData | undefined;

// tslint:disable-next-line:no-function-expression
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(30 * 1000);
    // Ensure template data is initialized before any 'Create Function' test is run
    backupTemplateData = await getTemplateDataFromBackup(undefined, path.join(__dirname, '..', '..', '..'));
    funcPortalTemplateData = await tryGetTemplateDataFromFuncPortal(undefined);
    funcStagingPortalTemplateData = await tryGetTemplateDataFromFuncPortal(undefined, undefined, 'functions-staging.azure.com');
});

export abstract class FunctionTesterBase implements vscode.Disposable {
    public backupTestFolder: string;
    public funcPortalTestFolder: string;
    public funcStagingPortalTestFolder: string;
    public outputChannel: vscode.OutputChannel;

    protected abstract _language: ProjectLanguage;
    protected abstract _runtime: ProjectRuntime;

    private _testFolder: string;
    private _oldTemplateFilter: string | undefined;
    private _oldProjectLanguage: string | undefined;
    private _oldProjectRuntime: string | undefined;

    constructor() {
        this._testFolder = path.join(os.tmpdir(), `azFunc.createFuncTests${fsUtil.getRandomHexString()}`);
        this.backupTestFolder = path.join(this._testFolder, 'backup');
        this.funcPortalTestFolder = path.join(this._testFolder, 'funcPortal');
        this.funcStagingPortalTestFolder = path.join(this._testFolder, 'funcStagingPortal');
        this.outputChannel = vscode.window.createOutputChannel('Azure Functions Test');
    }

    public async initAsync(): Promise<void> {
        this._oldTemplateFilter = getGlobalFuncExtensionSetting(templateFilterSetting);
        this._oldProjectLanguage = getGlobalFuncExtensionSetting(projectLanguageSetting);
        this._oldProjectRuntime = getGlobalFuncExtensionSetting(projectRuntimeSetting);

        await this.initializeTestFolder(this.backupTestFolder);
        await this.initializeTestFolder(this.funcPortalTestFolder);
        await this.initializeTestFolder(this.funcStagingPortalTestFolder);

        await updateGlobalSetting(templateFilterSetting, TemplateFilter.All);
        await updateGlobalSetting(projectLanguageSetting, this._language);
        await updateGlobalSetting(projectRuntimeSetting, this._runtime);
    }

    public async dispose(): Promise<void> {
        this.outputChannel.dispose();
        await fse.remove(this._testFolder);

        await updateGlobalSetting(templateFilterSetting, this._oldTemplateFilter);
        await updateGlobalSetting(projectLanguageSetting, this._oldProjectLanguage);
        await updateGlobalSetting(projectRuntimeSetting, this._oldProjectRuntime);
    }

    public async testCreateFunction(templateName: string, ...inputs: (string | undefined)[]): Promise<void> {
        if (funcPortalTemplateData) {
            await this.testCreateFunctionInternal(funcPortalTemplateData, this.funcPortalTestFolder, templateName, inputs.slice());
        } else {
            assert.fail('Failed to find templates from functions portal.');
        }

        if (funcStagingPortalTemplateData) {
            await this.testCreateFunctionInternal(funcStagingPortalTemplateData, this.funcStagingPortalTestFolder, templateName, inputs.slice());
        } else {
            assert.fail('Failed to find templates from functions staging portal.');
        }

        await this.testCreateFunctionInternal(backupTemplateData, this.backupTestFolder, templateName, inputs.slice());
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

    private async testCreateFunctionInternal(templateData: TemplateData, testFolder: string, templateName: string, inputs: (string | undefined)[]): Promise<void> {
        // Setup common inputs
        const funcName: string = templateName.replace(/ /g, '');
        inputs.unshift(funcName); // Specify the function name
        inputs.unshift(templateName); // Select the function template
        inputs.unshift(testFolder); // Select the test func app folder
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            inputs.unshift('$(file-directory) Browse...'); // If the test environment has an open workspace, select the 'Browse...' option
        }

        const ui: TestUI = new TestUI(inputs);
        await createFunction({ isActivationEvent: 'false', result: 'Succeeded', error: '', errorMessage: '' }, this.outputChannel, new TestAzureAccount(), templateData, ui);
        assert.equal(inputs.length, 0, 'Not all inputs were used.');

        await this.validateFunction(testFolder, funcName);
    }
}
