/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from 'vscode-azureextensionui';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { deploySubpathSetting, preDeployTaskSetting, ProjectLanguage } from '../constants';
import { localize } from '../localize';
import { promptToReinitializeProject } from './promptToReinitializeProject';
import { getWorkspaceSetting } from './settings';

export async function verifyJavaDeployConfigIsValid(projectLanguage: ProjectLanguage | undefined, workspacePath: string, context: IActionContext): Promise<void> {
    const preDeployTask: string | undefined = getWorkspaceSetting<string>(preDeployTaskSetting, workspacePath);
    const deploySubPath: string | undefined = getWorkspaceSetting<string>(deploySubpathSetting, workspacePath);

    if (!preDeployTask && !deploySubPath) {
        context.telemetry.properties.verifyConfigPrompt = 'updateJavaDeployConfig';

        const settingKey: string = 'showJavaDeployConfigWarning';
        const message: string = localize('updateJavaDeployConfig', 'Your deploy configuration is out of date and may not work with the latest version of the Azure Functions extension for VS Code.');
        const learnMoreLink: string = 'https://aka.ms/AA41zno';
        if (await promptToReinitializeProject(workspacePath, settingKey, message, learnMoreLink, context)) {
            context.errorHandling.suppressDisplay = false;
            await initProjectForVSCode(context, workspacePath, projectLanguage);
        }
    }
}
