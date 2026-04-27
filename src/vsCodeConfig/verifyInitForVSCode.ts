/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, type IActionContext } from '@microsoft/vscode-azext-utils';
import { tryParseFuncVersion, type FuncVersion } from '../FuncVersion';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { funcVersionSetting, projectLanguageModelSetting, projectLanguageSetting, type ProjectLanguage } from '../constants';
import { localize } from '../localize';
import { type TemplateSchemaVersion } from '../templates/TemplateProviderBase';
import { nonNullOrEmptyValue } from '../utils/nonNull';
import { getTemplateVersionFromLanguageAndModel } from '../utils/templateVersionUtils';
import { getWorkspaceSetting, updateWorkspaceSetting } from './settings';
import { detectProjectLanguageModel } from '../commands/initProjectForVSCode/detectProjectLanguage';

export interface VerifiedInit {
    language: ProjectLanguage,
    languageModel: number | undefined,
    version: FuncVersion,
    templateSchemaVersion: TemplateSchemaVersion
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
    } else if (languageModel === undefined) {
        languageModel = await detectProjectLanguageModel(<ProjectLanguage>language, fsPath);
        if (languageModel !== undefined) {
            await updateWorkspaceSetting(projectLanguageModelSetting, languageModel, fsPath);
        }
    }

    const templateSchemaVersion = getTemplateVersionFromLanguageAndModel(<ProjectLanguage>language, languageModel);

    return {
        language: <ProjectLanguage>language,
        languageModel,
        version: <FuncVersion>version,
        templateSchemaVersion
    };
}
