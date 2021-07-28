/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createTestActionContext, runWithTestActionContext, TestOutputChannel, TestUserInput } from 'vscode-azureextensiondev';
import { CentralTemplateProvider, deploySubpathSetting, envUtils, ext, FuncVersion, funcVersionSetting, getGlobalSetting, getRandomHexString, IActionContext, parseError, preDeployTaskSetting, ProjectLanguage, projectLanguageSetting, pythonVenvSetting, registerOnActionStartHandler, TemplateFilter, templateFilterSetting, TemplateSource, updateGlobalSetting, updateWorkspaceSetting } from '../extension.bundle';

/**
 * Folder for most tests that do not need a workspace open
 */
export const testFolderPath: string = path.join(os.tmpdir(), `azFuncTest${getRandomHexString()}`);

export let longRunningTestsEnabled: boolean;
export let updateBackupTemplates: boolean;
export let skipStagingTemplateSource: boolean;

const templateProviderMap = new Map<TemplateSource, CentralTemplateProvider>();

const requestTimeoutKey: string = 'requestTimeout';
let oldRequestTimeout: number | undefined;

let testWorkspaceFolders: string[];
let workspaceFolderIndex = 0;
export function getTestWorkspaceFolder(): string {
    if (workspaceFolderIndex >= testWorkspaceFolders.length) {
        throw new Error('Not enough workspace folders. Add more in "test/test.code-workspace".')
    }
    const result = testWorkspaceFolders[workspaceFolderIndex];
    workspaceFolderIndex += 1;
    return result;
}

// Runs before all tests
suiteSetup(async function (this: Mocha.Context): Promise<void> {
    this.timeout(4 * 60 * 1000);
    oldRequestTimeout = getGlobalSetting(requestTimeoutKey);
    await updateGlobalSetting(requestTimeoutKey, 45);

    await fse.ensureDir(testFolderPath);
    testWorkspaceFolders = await initTestWorkspaceFolders();

    await vscode.commands.executeCommand('azureFunctions.refresh'); // activate the extension before tests begin
    ext.outputChannel = new TestOutputChannel();

    registerOnActionStartHandler(context => {
        // Use `TestUserInput` by default so we get an error if an unexpected call to `context.ui` occurs, rather than timing out
        context.ui = new TestUserInput(vscode);
    });

    // Use prerelease func cli installed from gulp task (unless otherwise specified in env)
    ext.funcCliPath = process.env.FUNC_PATH || path.join(os.homedir(), 'tools', 'func', 'func');
    skipStagingTemplateSource = envUtils.isEnvironmentVariableSet(process.env.SKIP_STAGING_TEMPLATE_SOURCE);

    updateBackupTemplates = envUtils.isEnvironmentVariableSet(process.env.AZFUNC_UPDATE_BACKUP_TEMPLATES);
    if (!updateBackupTemplates) {
        await preLoadTemplates();
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
async function preLoadTemplates(): Promise<void> {
    const providers = [ext.templateProvider.get(await createTestActionContext())];
    for (const source of allTemplateSources) {
        if (!(source === TemplateSource.Staging && skipStagingTemplateSource)) {
            const provider = new CentralTemplateProvider(source);
            templateProviderMap.set(source, provider);
            providers.push(provider);
        }
    }

    const tasks: Promise<unknown>[] = [];
    for (const provider of providers) {
        await runWithTestActionContext('preLoadTemplates', async context => {
            ext.templateProvider.registerActionVariable(provider, context);
            for (const version of Object.values(FuncVersion)) {
                if (version === FuncVersion.v4) {
                    // v4 doesn't have templates yet
                    continue;
                }

                for (const language of [ProjectLanguage.JavaScript, ProjectLanguage.CSharp]) {
                    tasks.push(provider.getFunctionTemplates(context, testWorkspaceFolders[0], language, version, TemplateFilter.Verified, undefined));
                }
            }
        });
    }
    await Promise.all(tasks);
}

export const allTemplateSources: TemplateSource[] = Object.values(TemplateSource);
export async function runForTemplateSource(context: IActionContext, source: TemplateSource | undefined, callback: (templateProvider: CentralTemplateProvider) => Promise<void>): Promise<void> {
    let templateProvider: CentralTemplateProvider | undefined;
    if (source === undefined) {
        templateProvider = ext.templateProvider.get(context);
    } else {
        templateProvider = templateProviderMap.get(source);
        if (!templateProvider) {
            throw new Error(`Unrecognized source ${source}`);
        }
        ext.templateProvider.registerActionVariable(templateProvider, context);
    }

    await callback(templateProvider);
}

export async function cleanTestWorkspace(): Promise<void> {
    for (const folder of testWorkspaceFolders) {
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
            await updateWorkspaceSetting(setting, undefined, folder);
            await updateGlobalSetting(setting, undefined);
        }

        await fse.emptyDir(folder);
    }
    workspaceFolderIndex = 0;
}

async function initTestWorkspaceFolders(): Promise<string[]> {
    const workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error("No workspace is open");
    } else {
        const folders: string[] = [];
        for (let i = 0; i < workspaceFolders.length; i++) {
            const workspacePath: string = workspaceFolders[i].uri.fsPath;
            const folderName = path.basename(workspacePath);
            assert.equal(folderName, String(i), `Unexpected workspace folder name "${folderName}".`);
            await fse.ensureDir(workspacePath);
            await fse.emptyDir(workspacePath);
            folders.push(workspacePath);
        }
        return folders;
    }
}
