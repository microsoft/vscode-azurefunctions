/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext } from '@microsoft/vscode-azext-utils';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { funcVersionSetting, ProjectLanguage, projectLanguageModelSetting, projectLanguageSetting } from '../constants';
import { FuncVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { nonNullOrEmptyValue } from '../utils/nonNull';
import { getWorkspaceSetting } from './settings';

export interface VerifiedInit {
    language: ProjectLanguage,
    languageModel: number | undefined,
    version: FuncVersion
}

/**
 * Simpler function than `verifyVSCodeConfigOnActivate` to be used right before an operation that requires the project to be initialized for VS Code
 */
export async function verifyInitForVSCode(context: IActionContext, fsPath: string, language?: string, languageModel?: number, version?: string): Promise<VerifiedInit> {
    language = language || getWorkspaceSetting(projectLanguageSetting, fsPath);
    languageModel = languageModel || getWorkspaceSetting(projectLanguageModelSetting, fsPath);
    version = tryParseFuncVersion(version || getWorkspaceSetting(funcVersionSetting, fsPath));

    if (!language || !version) {
        const message: string = localize('initFolder', 'Initialize project for use with VS Code?');
        // No need to check result - cancel will throw a UserCancelledError
        await context.ui.showWarningMessage(message, { modal: true, stepName: 'initProject' }, DialogResponses.yes);
        await initProjectForVSCode(context, fsPath);
        language = nonNullOrEmptyValue(getWorkspaceSetting(projectLanguageSetting, fsPath), projectLanguageSetting);
        languageModel = getWorkspaceSetting(projectLanguageModelSetting, fsPath);
        version = nonNullOrEmptyValue(tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, fsPath)), funcVersionSetting);
    }

    return {
        language: <ProjectLanguage>language,
        languageModel,
        version: <FuncVersion>version
    };
}
