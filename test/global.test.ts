/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { IHookCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext, getRandomHexString, getTemplateProvider, parseError, TemplateProvider, TemplateSource, TestUserInput } from '../extension.bundle';
import { TestOutputChannel } from './TestOutputChannel';

export let longRunningTestsEnabled: boolean;
export const testFolderPath: string = path.join(os.tmpdir(), `azFuncTest${getRandomHexString()}`);

let templatesMap: Map<TemplateSource, TemplateProvider>;

// Runs before all tests
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(120 * 1000);

    await fse.ensureDir(testFolderPath);

    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin
    await ext.templateProviderTask; // make sure default templates are loaded before setting up templates from other sources
    ext.outputChannel = new TestOutputChannel();
    ext.ui = new TestUserInput([]);

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
    } catch (error) {
        // Build machines fail pretty often with an EPERM error on Windows, but removing the temp test folder isn't worth failing the build
        console.warn(`Failed to delete test folder path: ${parseError(error).message}`);
    }
});

export async function runForAllTemplateSources(callback: (source: TemplateSource, templates: TemplateProvider) => Promise<void>): Promise<void> {
    const oldProvider: Promise<TemplateProvider> = ext.templateProviderTask;
    try {
        for (const [source, templates] of templatesMap) {
            console.log(`Switching to template source "${source}".`);
            ext.templateSource = source;
            ext.templateProviderTask = Promise.resolve(templates);
            await callback(source, templates);
        }
    } finally {
        console.log(`Switching back to default template source.`);
        ext.templateSource = undefined;
        ext.templateProviderTask = oldProvider;
    }
}
