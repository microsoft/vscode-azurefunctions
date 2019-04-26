/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azureStorage from "azure-storage";
import * as vscode from 'vscode';
import { parseError } from "vscode-azureextensionui";
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { isWindows, localEmulatorConnectionString, localSettingsFileName } from "../constants";
import { ext } from "../extensionVariables";
import { azureWebJobsStorageKey, getAzureWebJobsStorage } from "../funcConfig/local.settings";
import { validateFuncCoreToolsInstalled } from '../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../localize';
import { getDebugConfigs, isDebugConfigEqual } from '../vsCodeConfig/launch';

export interface IPreDebugValidateResult {
    workspace: vscode.WorkspaceFolder;
    shouldContinue: boolean;
}

export async function preDebugValidate(debugConfig: vscode.DebugConfiguration): Promise<IPreDebugValidateResult> {
    const workspace: vscode.WorkspaceFolder = getMatchingWorkspace(debugConfig);
    let shouldContinue: boolean = await validateFuncCoreToolsInstalled();
    if (shouldContinue) {
        const projectPath: string | undefined = await tryGetFunctionProjectRoot(workspace.uri.fsPath, true /* suppressPrompt */);
        if (projectPath) {
            shouldContinue = await validateEmulatorIsRunning(projectPath);
        }
    }

    return { workspace, shouldContinue };
}

function getMatchingWorkspace(debugConfig: vscode.DebugConfiguration): vscode.WorkspaceFolder {
    if (vscode.workspace.workspaceFolders) {
        for (const workspace of vscode.workspace.workspaceFolders) {
            try {
                const configs: vscode.DebugConfiguration[] = getDebugConfigs(workspace);
                if (configs.some(c => isDebugConfigEqual(c, debugConfig))) {
                    return workspace;
                }
            } catch {
                // ignore and try next workspace
            }
        }
    }

    throw new Error(localize('noDebug', 'Failed to find launch config matching name "{0}", request "{1}", and type "{2}".', debugConfig.name, debugConfig.request, debugConfig.type));
}

/**
 * If AzureWebJobsStorage is set, pings the emulator to make sure it's actually running
 */
async function validateEmulatorIsRunning(projectPath: string): Promise<boolean> {
    const azureWebJobsStorage: string | undefined = await getAzureWebJobsStorage(projectPath);
    if (azureWebJobsStorage && azureWebJobsStorage.toLowerCase() === localEmulatorConnectionString.toLowerCase()) {
        try {
            const client: azureStorage.BlobService = azureStorage.createBlobService(azureWebJobsStorage);
            await new Promise((resolve, reject): void => {
                // Checking against a common container for functions, but doesn't really matter what call we make here
                client.doesContainerExist('azure-webjob-hosts', (err: Error | undefined) => {
                    // tslint:disable-next-line: no-void-expression
                    err ? reject(err) : resolve();
                });
            });
        } catch (error) {
            const message: string = localize('failedToConnectEmulator', 'Failed to verify "{0}" connection specified in "{1}". Is the local emulator installed and running?', azureWebJobsStorageKey, localSettingsFileName);
            const learnMoreLink: string = isWindows ? 'https://aka.ms/AA4ym56' : 'https://aka.ms/AA4yef8';

            const debugAnyway: vscode.MessageItem = { title: localize('debugAnyway', 'Debug anyway') };
            try {
                const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, { learnMoreLink, modal: true }, debugAnyway);
                if (result === debugAnyway) {
                    return true;
                }
            } catch (error) {
                if (!parseError(error).isUserCancelledError) {
                    throw error;
                }
            }

            return false;
        }
    }

    return true;
}
