/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IDeployContext } from '@microsoft/vscode-azext-azureappservice';
import * as path from 'path';
import type * as vscode from 'vscode';
import { deploySubpathSetting, packTaskName, preDeployTaskSetting, remoteBuildSetting } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { updateWorkspaceSetting } from '../../vsCodeConfig/settings';
import { tryGetFunctionProjectRoot } from '../createNewProject/verifyIsProject';
import { ensureGitIgnoreContents } from '../initProjectForVSCode/InitVSCodeStep/PythonInitVSCodeStep';

/**
 * Writes the workspace settings needed for Go Functions to deploy via local
 * `func pack` + zip-push. Idempotent — safe to run on every deploy.
 *
 * Go has no remote-build path on Azure (Oryx doesn't support Go Functions),
 * so we force `scmDoBuildDuringDeployment` off, set `preDeployTask` to
 * `func: pack`, point `deploySubpath` at the zip that pack will produce,
 * and ensure that zip is `.gitignore`d.
 */
export async function applyGoDeployDefaults(context: IDeployContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const projectPath: string = await tryGetFunctionProjectRoot(context, workspaceFolder) || workspaceFolder.uri.fsPath;
    const zipFileName: string = path.basename(projectPath) + '.zip';
    // Always use posix separators for config checked in to source control
    const deploySubpathValue: string = path.posix.join(path.relative(workspaceFolder.uri.fsPath, projectPath), zipFileName);

    await updateWorkspaceSetting(remoteBuildSetting, false, workspaceFolder);
    await updateWorkspaceSetting(preDeployTaskSetting, packTaskName, workspaceFolder);
    await updateWorkspaceSetting(deploySubpathSetting, deploySubpathValue, workspaceFolder);
    await ensureGitIgnoreContents(projectPath, [zipFileName]);

    context.telemetry.properties.appliedGoDeployDefaults = 'true';
    ext.outputChannel.appendLog(localize('configuredGoDeploy',
        'Configured Go deploy settings: preDeployTask="{0}", deploySubpath="{1}", scmDoBuildDuringDeployment=false.',
        packTaskName, deploySubpathValue));
}
