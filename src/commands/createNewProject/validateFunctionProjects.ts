/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as opn from 'opn';
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext, IAzureUserInput } from 'vscode-azureextensionui';
import { gitignoreFileName, hostFileName, localSettingsFileName, projectLanguageSetting, projectRuntimeSetting } from '../../constants';
import { localize } from '../../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../../ProjectSettings';
import { initProjectForVSCode } from './initProjectForVSCode';

export async function validateFunctionProjects(actionContext: IActionContext, ui: IAzureUserInput, outputChannel: vscode.OutputChannel, folders: vscode.WorkspaceFolder[] | undefined): Promise<void> {
    actionContext.suppressTelemetry = true;
    if (folders) {
        for (const folder of folders) {
            const folderPath: string = folder.uri.fsPath;
            if (await isFunctionProject(folderPath)) {
                actionContext.suppressTelemetry = false;

                if (isInitializedProject(folderPath)) {
                    actionContext.properties.isInitialized = 'true';
                } else {
                    actionContext.properties.isInitialized = 'false';
                    if (await promptToInitializeProject(ui, folderPath)) {
                        await initProjectForVSCode(actionContext.properties, ui, outputChannel, folderPath);
                    }
                }
            }
        }
    }
}

async function promptToInitializeProject(ui: IAzureUserInput, folderPath: string): Promise<boolean> {
    const settingKey: string = 'showProjectWarning';
    if (getFuncExtensionSetting<boolean>(settingKey)) {
        const message: string = localize('uninitializedWarning', 'Detected an Azure Functions Project in folder "{0}" that may have been created outside of VS Code. Initialize for optimal use with VS Code?', path.basename(folderPath));
        const result: vscode.MessageItem = await ui.showWarningMessage(message, DialogResponses.yes, DialogResponses.dontWarnAgain, DialogResponses.learnMore);
        if (result === DialogResponses.dontWarnAgain) {
            await updateGlobalSetting(settingKey, false);
        } else if (result === DialogResponses.learnMore) {
            // tslint:disable-next-line:no-unsafe-any
            opn('https://aka.ms/azFuncProject');
            return await promptToInitializeProject(ui, folderPath);
        } else {
            return true;
        }
    }

    return false;
}

export async function isFunctionProject(folderPath: string): Promise<boolean> {
    const gitignorePath: string = path.join(folderPath, gitignoreFileName);
    let gitignoreContents: string = '';
    if (await fse.pathExists(gitignorePath)) {
        gitignoreContents = (await fse.readFile(gitignorePath)).toString();
    }

    return await fse.pathExists(path.join(folderPath, hostFileName)) && (await fse.pathExists(path.join(folderPath, localSettingsFileName)) || gitignoreContents.includes(localSettingsFileName));
}

function isInitializedProject(folderPath: string): boolean {
    const langauge: string | undefined = getFuncExtensionSetting(projectLanguageSetting, folderPath);
    const runtime: string | undefined = getFuncExtensionSetting(projectRuntimeSetting, folderPath);
    return !!langauge && !!runtime;
}
