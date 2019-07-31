/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { IHookCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestOutputChannel, TestUserInput } from 'vscode-azureextensiondev';
import { ext, getRandomHexString, getTemplateProvider, parseError, TemplateProvider, TemplateSource } from '../extension.bundle';

/**
 * Folder for most tests that do not need a workspace open
 */
export const testFolderPath: string = path.join(os.tmpdir(), `azFuncTest${getRandomHexString()}`);

/**
 * Folder for tests that require a workspace
 */
export let testWorkspacePath: string;

export let longRunningTestsEnabled: boolean;
export let testUserInput: TestUserInput = new TestUserInput(vscode);

let templatesMap: Map<TemplateSource, TemplateProvider>;

// Runs before all tests
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(120 * 1000);

    await fse.ensureDir(testFolderPath);
    testWorkspacePath = await initTestWorkspacePath();

    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin
    await ext.templateProviderTask; // make sure default templates are loaded before setting up templates from other sources
    ext.outputChannel = new TestOutputChannel();
    ext.ui = testUserInput;

    // Use prerelease func cli installed from gulp task (unless otherwise specified in env)
    ext.funcCliPath = process.env.FUNC_PATH || path.join(os.homedir(), 'tools', 'func', 'func');

    templatesMap = new Map();
    try {
        for (const key of Object.keys(TemplateSource)) {
            const source: TemplateSource = <TemplateSource>TemplateSource[key];
            ext.templateSource = source;
            templatesMap.set(source, await getTemplateProvider());
        }
    } finally {
        ext.templateSource = undefined;
    }

    // tslint:disable-next-line:strict-boolean-expressions
    longRunningTestsEnabled = !/^(false|0)?$/i.test(process.env.ENABLE_LONG_RUNNING_TESTS || '');

    // set AzureWebJobsStorage so that it doesn't prompt during tests
    process.env.AzureWebJobsStorage = 'ignore';
});

suiteTeardown(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(90 * 1000);
    try {
        await fse.remove(testFolderPath);
        await fse.emptyDir(testWorkspacePath);
    } catch (error) {
        // Build machines fail pretty often with an EPERM error on Windows, but removing the temp test folder isn't worth failing the build
        console.warn(`Failed to delete test folder path: ${parseError(error).message}`);
    }
});

export async function runForAllTemplateSources(callback: (source: TemplateSource, templates: TemplateProvider) => Promise<void>): Promise<void> {
    for (const source of templatesMap.keys()) {
        await runForTemplateSource(source, (templates: TemplateProvider) => callback(source, templates));
    }
}

export async function runForTemplateSource(source: TemplateSource | undefined, callback: (templates: TemplateProvider) => Promise<void>): Promise<void> {
    const oldProvider: Promise<TemplateProvider> = ext.templateProviderTask;
    try {
        let templates: TemplateProvider | undefined;
        if (source === undefined) {
            templates = await ext.templateProviderTask;
        } else {
            templates = templatesMap.get(source);
            if (!templates) {
                throw new Error(`Unrecognized source ${source}`);
            }
            ext.templateSource = source;
            ext.templateProviderTask = Promise.resolve(templates);
        }

        await callback(templates);
    } finally {
        ext.templateSource = undefined;
        ext.templateProviderTask = oldProvider;
    }
}

async function initTestWorkspacePath(): Promise<string> {
    const workspaceFolders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error("No workspace is open");
    } else {
        assert.equal(workspaceFolders.length, 1, "Expected only one workspace to be open.");
        const workspacePath: string = workspaceFolders[0].uri.fsPath;
        assert.equal(path.basename(workspacePath), 'testWorkspace', "Opened against an unexpected workspace.");
        await fse.ensureDir(workspacePath);
        await fse.emptyDir(workspacePath);
        return workspacePath;
    }
}
