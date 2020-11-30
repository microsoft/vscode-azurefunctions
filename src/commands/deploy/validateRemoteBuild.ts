/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { SiteClient } from 'vscode-azureappservice';
import { IActionContext } from 'vscode-azureextensionui';
import { deploySubpathSetting, packTaskName, preDeployTaskSetting, ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { getWorkspaceSetting, updateWorkspaceSetting } from '../../vsCodeConfig/settings';
import { tryGetFunctionProjectRoot } from '../createNewProject/verifyIsProject';
import { ensureGitIgnoreContents } from '../initProjectForVSCode/InitVSCodeStep/PythonInitVSCodeStep';

export async function validateRemoteBuild(context: IActionContext, client: SiteClient, workspacePath: string, language: ProjectLanguage): Promise<void> {
    if (language === ProjectLanguage.Python && !client.kuduUrl) {
        const remoteBuildKey: string = 'scmDoBuildDuringDeployment';

        const remoteBuild: boolean | undefined = getWorkspaceSetting(remoteBuildKey, workspacePath);
        if (remoteBuild) {
            const message: string = localize('remoteBuildNotSupported', 'The selected Function App doesn\'t support your project\'s configuration. Deploy to a newer Function App or downgrade your config.');
            const learnMoreLink: string = 'https://aka.ms/AA5vsfd';
            const downgrade: vscode.MessageItem = { title: localize('downgrade', 'Downgrade config') };
            context.telemetry.properties.cancelStep = 'validateRemoteBuild';
            await context.ui.showWarningMessage(message, { learnMoreLink, modal: true }, downgrade);
            context.telemetry.properties.cancelStep = undefined;

            const projectPath: string = await tryGetFunctionProjectRoot(workspacePath, true /* suppressPrompt */) || workspacePath;
            await updateWorkspaceSetting(remoteBuildKey, false, workspacePath);
            await updateWorkspaceSetting(preDeployTaskSetting, packTaskName, workspacePath);
            const zipFileName: string = path.basename(projectPath) + '.zip';
            // Always use posix separators for config checked in to source control
            await updateWorkspaceSetting(deploySubpathSetting, path.posix.join(path.relative(workspacePath, projectPath), zipFileName), workspacePath);
            await ensureGitIgnoreContents(projectPath, [zipFileName]);
        }
    }
}
