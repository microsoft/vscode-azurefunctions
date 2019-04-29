/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { nonNullOrEmptyValue } from '../utils/nonNull';
import { convertStringToRuntime, getWorkspaceSetting } from './settings';

/**
 * Simpler function than `verifyVSCodeConfigOnActivate` to be used right before an operation that requires the project to be initialized for VS Code
 */
export async function verifyInitForVSCode(actionContext: IActionContext, fsPath: string, language?: string, runtime?: string): Promise<[ProjectLanguage, ProjectRuntime]> {
    language = language || getWorkspaceSetting(projectLanguageSetting, fsPath);
    runtime = convertStringToRuntime(runtime || getWorkspaceSetting(projectRuntimeSetting, fsPath));

    if (!language || !runtime) {
        const message: string = localize('initFolder', 'Initialize project for use with VS Code?');
        // No need to check result - cancel will throw a UserCancelledError
        await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes);
        await initProjectForVSCode(actionContext, fsPath);
        language = nonNullOrEmptyValue(getWorkspaceSetting(projectLanguageSetting, fsPath));
        runtime = nonNullOrEmptyValue(convertStringToRuntime(getWorkspaceSetting(projectRuntimeSetting, fsPath)));
    }

    return [<ProjectLanguage>language, <ProjectRuntime>runtime];
}
