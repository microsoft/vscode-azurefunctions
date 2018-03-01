/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as opn from 'opn';
import * as path from 'path';
import * as vscode from 'vscode';
import { IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { DialogResponses } from '../../DialogResponses';
import { localize } from '../../localize';
import { getFuncExtensionSetting, projectLanguageSetting, projectRuntimeSetting, requiredFunctionAppFiles, updateGlobalSetting } from '../../ProjectSettings';
import { initProjectForVSCode } from './initProjectForVSCode';

export async function validateFunctionProjects(actionContext: IActionContext, outputChannel: vscode.OutputChannel, folders: vscode.WorkspaceFolder[] | undefined): Promise<void> {
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
                    if (await promptToInitializeProject(folderPath)) {
                        await initProjectForVSCode(actionContext.properties, outputChannel, folderPath);
                    }
                }
            }
        }
    }
}

async function promptToInitializeProject(folderPath: string): Promise<boolean> {
    const settingKey: string = 'showProjectWarning';
    if (getFuncExtensionSetting<boolean>(settingKey)) {
        const message: string = localize('uninitializedWarning', 'Detected an Azure Functions Project in folder "{0}" that may have been created outside of VS Code. Initialize for optimal use with VS Code?', path.basename(folderPath));
        const result: vscode.MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.yes, DialogResponses.dontWarnAgain, DialogResponses.seeMoreInfo);
        if (result === DialogResponses.yes) {
            return true;
        } else if (result === DialogResponses.dontWarnAgain) {
            await updateGlobalSetting(settingKey, false);
        } else if (result === DialogResponses.seeMoreInfo) {
            // tslint:disable-next-line:no-unsafe-any
            opn('https://aka.ms/azFuncProject');
            await promptToInitializeProject(folderPath);
        } else {
            throw new UserCancelledError();
        }
    }

    return false;
}

async function isFunctionProject(folderPath: string): Promise<boolean> {
    for (const fileName of requiredFunctionAppFiles) {
        if (!await fse.pathExists(path.join(folderPath, fileName))) {
            return false;
        }
    }

    return true;
}

function isInitializedProject(folderPath: string): boolean {
    const langauge: string | undefined = getFuncExtensionSetting(projectLanguageSetting, folderPath);
    const runtime: string | undefined = getFuncExtensionSetting(projectRuntimeSetting, folderPath);
    return !!langauge && !!runtime;
}
