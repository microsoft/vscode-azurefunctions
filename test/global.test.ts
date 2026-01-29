/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestOutputChannel, TestUserInput } from '@microsoft/vscode-azext-dev';
import { AzExtFsExtra, IActionContext, parseError, registerOnActionStartHandler } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { deploySubpathSetting, funcVersionSetting, preDeployTaskSetting, projectLanguageSetting, pythonVenvSetting, templateFilterSetting } from '../src/constants';
import { ext, TemplateSource } from '../src/extensionVariables';
import { FuncVersion } from '../src/FuncVersion';
import { CentralTemplateProvider } from '../src/templates/CentralTemplateProvider';
import { envUtils } from '../src/utils/envUtils';
import { getRandomHexString } from '../src/utils/fs';
import { getGlobalSetting, updateGlobalSetting, updateWorkspaceSetting } from '../src/vsCodeConfig/settings';

/**
 * Folder for most tests that do not need a workspace open
 */
export const testFolderPath: string = path.join(os.tmpdir(), `azFuncTest${getRandomHexString()}`);

const longRunningLocalTestsEnabled: boolean = envUtils.isEnvironmentVariableSet(process.env.AzCode_EnableLongRunningTestsLocal);
const longRunningRemoteTestsEnabled: boolean = envUtils.isEnvironmentVariableSet(process.env.AzCode_UseAzureFederatedCredentials);

export const longRunningTestsEnabled: boolean = longRunningLocalTestsEnabled || longRunningRemoteTestsEnabled;
export const updateBackupTemplates: boolean = envUtils.isEnvironmentVariableSet(process.env.AZFUNC_UPDATE_BACKUP_TEMPLATES);
export const skipStagingTemplateSource: boolean = envUtils.isEnvironmentVariableSet(process.env.SKIP_STAGING_TEMPLATE_SOURCE);

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

    await AzExtFsExtra.ensureDir(testFolderPath);
    testWorkspaceFolders = await initTestWorkspaceFolders();

    const funcExtension = vscode.extensions.getExtension('ms-azuretools.vscode-azurefunctions');
    if (!funcExtension) {
        throw new Error('Could not find the Azure Functions extension.');
    }
    await funcExtension.activate(); // activate the extension before tests begin

    this.skip();
    ext.outputChannel = new TestOutputChannel();

    registerOnActionStartHandler(context => {
        // Use `TestUserInput` by default so we get an error if an unexpected call to `context.ui` occurs, rather than timing out
        context.ui = new TestUserInput(vscode);
    });

    // Use prerelease func cli installed from gulp task (unless otherwise specified in env)
    ext.defaultFuncCliPath = process.env.FUNC_PATH || path.join(os.homedir(), 'tools', 'func', 'func');

    // set AzureWebJobsStorage so that it doesn't prompt during tests
    process.env.AzureWebJobsStorage = 'ignore';
});

suiteTeardown(async function (this: Mocha.Context): Promise<void> {
    this.timeout(90 * 1000);
    try {
        await AzExtFsExtra.deleteResource(testFolderPath, { recursive: true });
        await cleanTestWorkspace();
    } catch (error) {
        // Build machines fail pretty often with an EPERM error on Windows, but removing the temp test folder isn't worth failing the build
        console.warn(`Failed to delete test folder path: ${parseError(error).message}`);
    }
    await updateGlobalSetting(requestTimeoutKey, oldRequestTimeout);
});

/**
 * Not worth testing older versions for every build
 */
export function isLongRunningVersion(version: FuncVersion): boolean {
    return version === FuncVersion.v1 || version === FuncVersion.v2 || version === FuncVersion.v3;
}

export function shouldSkipVersion(version: FuncVersion): boolean {
    return isLongRunningVersion(version) && !longRunningTestsEnabled;
}

export const backupLatestTemplateSources: TemplateSource[] = [TemplateSource.Backup, TemplateSource.Latest];
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

        await AzExtFsExtra.emptyDir(folder);
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
            await AzExtFsExtra.ensureDir(workspacePath);
            await AzExtFsExtra.emptyDir(workspacePath);
            folders.push(workspacePath);
        }
        return folders;
    }
}
