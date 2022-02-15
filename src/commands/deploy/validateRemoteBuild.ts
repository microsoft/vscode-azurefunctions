/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDeployContext, ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import * as path from 'path';
import * as vscode from 'vscode';
import { deploySubpathSetting, packTaskName, preDeployTaskSetting, ProjectLanguage, remoteBuildSetting } from '../../constants';
import { localize } from '../../localize';
import { updateWorkspaceSetting } from '../../vsCodeConfig/settings';
import { tryGetFunctionProjectRoot } from '../createNewProject/verifyIsProject';
import { ensureGitIgnoreContents } from '../initProjectForVSCode/InitVSCodeStep/PythonInitVSCodeStep';

export async function validateRemoteBuild(context: IDeployContext, site: ParsedSite, workspaceFolder: vscode.WorkspaceFolder, language: ProjectLanguage): Promise<void> {
    if (language === ProjectLanguage.Python && !site.kuduUrl) {
        const message: string = localize('remoteBuildNotSupported', 'The selected Function App doesn\'t support your project\'s configuration. Deploy to a newer Function App or downgrade your config.');
        const learnMoreLink: string = 'https://aka.ms/AA5vsfd';
        const downgrade: vscode.MessageItem = { title: localize('downgrade', 'Downgrade config') };
        await context.ui.showWarningMessage(message, { learnMoreLink, modal: true, stepName: 'validateRemoteBuild' }, downgrade);

        const projectPath: string = await tryGetFunctionProjectRoot(context, workspaceFolder) || workspaceFolder.uri.fsPath;
        await updateWorkspaceSetting(remoteBuildSetting, false, workspaceFolder);
        await updateWorkspaceSetting(preDeployTaskSetting, packTaskName, workspaceFolder);
        const zipFileName: string = path.basename(projectPath) + '.zip';
        // Always use posix separators for config checked in to source control
        await updateWorkspaceSetting(deploySubpathSetting, path.posix.join(path.relative(workspaceFolder.uri.fsPath, projectPath), zipFileName), workspaceFolder);
        await ensureGitIgnoreContents(projectPath, [zipFileName]);
    }
}
