/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestOutputChannel, TestUserInput } from 'vscode-azureextensiondev';
import { CentralTemplateProvider, deploySubpathSetting, envUtils, ext, FuncVersion, funcVersionSetting, getGlobalSetting, getRandomHexString, IActionContext, parseError, preDeployTaskSetting, ProjectLanguage, projectLanguageSetting, pythonVenvSetting, TemplateFilter, templateFilterSetting, TemplateSource, updateGlobalSetting, updateWorkspaceSetting } from '../extension.bundle';

/**
 * Folder for most tests that do not need a workspace open
 */
export const testFolderPath: string = path.join(os.tmpdir(), `azFuncTest${getRandomHexString()}`);

/**
 * Folder for tests that require a workspace
 */
export let testWorkspacePath: string;

export let longRunningTestsEnabled: boolean;
export let updateBackupTemplates: boolean;
export let skipStagingTemplateSource: boolean;
export const testUserInput: TestUserInput = new TestUserInput(vscode);

export function createTestActionContext(): IActionContext {
    return { telemetry: { properties: {}, measurements: {} }, errorHandling: { issueProperties: {} }, valuesToMask: [], ui: testUserInput };
}

let templateProviderMap: Map<TemplateSource, CentralTemplateProvider>;

const requestTimeoutKey: string = 'requestTimeout';
let oldRequestTimeout: number | undefined;

// Runs before all tests
suiteSetup(async function (this: Mocha.Context): Promise<void> {
    this.timeout(4 * 60 * 1000);
    oldRequestTimeout = getGlobalSetting(requestTimeoutKey);
    await updateGlobalSetting(requestTimeoutKey, 45);

    await fse.ensureDir(testFolderPath);
    testWorkspacePath = await initTestWorkspacePath();

    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin
    ext.outputChannel = new TestOutputChannel();
    ext.ui = testUserInput;

    // Use prerelease func cli installed from gulp task (unless otherwise specified in env)
    ext.funcCliPath = process.env.FUNC_PATH || path.join(os.homedir(), 'tools', 'func', 'func');
    skipStagingTemplateSource = envUtils.isEnvironmentVariableSet(process.env.SKIP_STAGING_TEMPLATE_SOURCE);

    updateBackupTemplates = envUtils.isEnvironmentVariableSet(process.env.AZFUNC_UPDATE_BACKUP_TEMPLATES);
    if (!updateBackupTemplates) {
        await preLoadTemplates(ext.templateProvider);
        templateProviderMap = new Map();
        for (const source of allTemplateSources) {
            if (!(source === TemplateSource.Staging && skipStagingTemplateSource)) {
                templateProviderMap.set(source, new CentralTemplateProvider(source));
            }

            await runForTemplateSource(source, preLoadTemplates);
        }
    }

    longRunningTestsEnabled = envUtils.isEnvironmentVariableSet(process.env.ENABLE_LONG_RUNNING_TESTS);

    // set AzureWebJobsStorage so that it doesn't prompt during tests
    process.env.AzureWebJobsStorage = 'ignore';
});

suiteTeardown(async function (this: Mocha.Context): Promise<void> {
    this.timeout(90 * 1000);
    try {
        await fse.remove(testFolderPath);
        await cleanTestWorkspace();
    } catch (error) {
        // Build machines fail pretty often with an EPERM error on Windows, but removing the temp test folder isn't worth failing the build
        console.warn(`Failed to delete test folder path: ${parseError(error).message}`);
    }
    await updateGlobalSetting(requestTimeoutKey, oldRequestTimeout);
});

/**
 * Pre-load templates so that the first related unit test doesn't time out
 */
async function preLoadTemplates(provider: CentralTemplateProvider): Promise<void> {
    console.log(`Loading templates for source "${provider.templateSource}"`);
    const languages: ProjectLanguage[] = [ProjectLanguage.JavaScript, ProjectLanguage.CSharp];

    for (const version of Object.values(FuncVersion)) {
        for (const language of languages) {
            await provider.getFunctionTemplates(createTestActionContext(), undefined, language, version, TemplateFilter.Verified, undefined);
        }
    }
}

export const allTemplateSources: TemplateSource[] = Object.values(TemplateSource);
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

        try {
            await callback(templateProvider);
        } catch (e) {
            // Only display this when a test fails, otherwise it'll clog up the logs
            console.log(`Test failed for template source "${source}".`);
            throw e;
        }
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
        await updateGlobalSetting(setting, undefined);
    }

    await fse.emptyDir(testWorkspacePath);
}

async function initTestWorkspacePath(): Promise<string> {
    const workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
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
