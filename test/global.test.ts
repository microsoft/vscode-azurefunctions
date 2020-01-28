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
import { CentralTemplateProvider, deploySubpathSetting, ext, FuncVersion, funcVersionSetting, getRandomHexString, IActionContext, parseError, preDeployTaskSetting, ProjectLanguage, projectLanguageSetting, pythonVenvSetting, templateFilterSetting, TemplateSource, updateWorkspaceSetting } from '../extension.bundle';

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

export function createTestActionContext(): IActionContext {
    return { telemetry: { properties: {}, measurements: {} }, errorHandling: { issueProperties: {} } };
}

let templateProviderMap: Map<TemplateSource, CentralTemplateProvider>;

// Runs before all tests
suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(4 * 60 * 1000);

    await fse.ensureDir(testFolderPath);
    testWorkspacePath = await initTestWorkspacePath();

    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin
    ext.outputChannel = new TestOutputChannel();
    ext.ui = testUserInput;

    // Use prerelease func cli installed from gulp task (unless otherwise specified in env)
    ext.funcCliPath = process.env.FUNC_PATH || path.join(os.homedir(), 'tools', 'func', 'func');

    await preLoadTemplates(ext.templateProvider);
    templateProviderMap = new Map();
    for (const source of Object.values(TemplateSource)) {
        templateProviderMap.set(source, new CentralTemplateProvider(source));
    }

    await runForAllTemplateSources(async (_source, provider) => await preLoadTemplates(provider));

    // tslint:disable-next-line:strict-boolean-expressions
    longRunningTestsEnabled = !/^(false|0)?$/i.test(process.env.ENABLE_LONG_RUNNING_TESTS || '');

    // set AzureWebJobsStorage so that it doesn't prompt during tests
    process.env.AzureWebJobsStorage = 'ignore';
});

suiteTeardown(async function (this: IHookCallbackContext): Promise<void> {
    this.timeout(90 * 1000);
    try {
        await fse.remove(testFolderPath);
        await cleanTestWorkspace();
    } catch (error) {
        // Build machines fail pretty often with an EPERM error on Windows, but removing the temp test folder isn't worth failing the build
        console.warn(`Failed to delete test folder path: ${parseError(error).message}`);
    }
});

/**
 * Pre-load templates so that the first related unit test doesn't time out
 */
async function preLoadTemplates(provider: CentralTemplateProvider): Promise<void> {
    console.log(`Loading templates for source "${provider.templateSource}"`);
    const languages: ProjectLanguage[] = [ProjectLanguage.JavaScript, ProjectLanguage.CSharp];

    for (const version of Object.values(FuncVersion)) {
        for (const language of languages) {
            await provider.getFunctionTemplates(createTestActionContext(), undefined, language, version);
        }
    }
}

export async function runForAllTemplateSources(callback: (source: TemplateSource, templateProvider: CentralTemplateProvider) => Promise<void>): Promise<void> {
    for (const source of templateProviderMap.keys()) {
        await runForTemplateSource(source, (templateProvider: CentralTemplateProvider) => callback(source, templateProvider));
    }
}

export async function runForTemplateSource(source: TemplateSource | undefined, callback: (templateProvider: CentralTemplateProvider) => Promise<void>): Promise<void> {
    const oldProvider: CentralTemplateProvider = ext.templateProvider;
    try {
        let templateProvider: CentralTemplateProvider | undefined;
        if (source === undefined) {
            templateProvider = ext.templateProvider;
        } else {
            templateProvider = templateProviderMap.get(source);
            if (!templateProvider) {
                throw new Error(`Unrecognized source ${source}`);
            }
            ext.templateProvider = templateProvider;
        }

        await callback(templateProvider);
    } finally {
        ext.templateProvider = oldProvider;
    }
}

export async function cleanTestWorkspace(): Promise<void> {
    // Doing this because VS Code doesn't always register changes to settings if you just delete "settings.json"
    const settings: string[] = [
        projectLanguageSetting,
        funcVersionSetting,
        templateFilterSetting,
        deploySubpathSetting,
        preDeployTaskSetting,
        pythonVenvSetting
    ];
    for (const setting of settings) {
        await updateWorkspaceSetting(setting, undefined, testWorkspacePath);
    }

    await fse.emptyDir(testWorkspacePath);
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
