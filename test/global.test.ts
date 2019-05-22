/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { IHookCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestOutputChannel } from 'vscode-azureextensiondev';
import { ext, getRandomHexString, getTemplateProvider, parseError, TemplateProvider, TemplateSource, TestUserInput } from '../extension.bundle';

export namespace constants {
    export const testOutputName: string = 'testOutput';
}

// The root workspace folder that vscode is opened against for tests
let testRootFolder: string;

export function getTestRootFolder(): string {
    if (!testRootFolder) {
        // We're expecting to be opened against the test/test.code-workspace
        // workspace.
        const workspaceFolders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.error("No workspace is open.");
            process.exit(1);
        } else {
            if (workspaceFolders.length > 1) {
                console.error("There are unexpected multiple workspaces open");
                process.exit(1);
            }

            testRootFolder = workspaceFolders[0].uri.fsPath;
            console.log(`testRootFolder: ${testRootFolder}`);
            if (path.basename(testRootFolder) !== constants.testOutputName) {
                console.error("vscode is opened against the wrong folder for tests");
                process.exit(1);
            }

            fse.ensureDirSync(testRootFolder);
            fse.emptyDirSync(testRootFolder);
        }
    }

    return testRootFolder;
}

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
