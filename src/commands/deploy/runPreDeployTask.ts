/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { handleFailedPreDeployTask, IDeployContext, IPreDeployTaskResult, tryRunPreDeployTask } from '@microsoft/vscode-azext-azureappservice';
import { DialogResponses, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { buildNativeDeps, packTaskName, preDeployTaskSetting, tasksFileName } from '../../constants';
import { ext } from '../../extensionVariables';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../../localize';
import { openUrl } from '../../utils/openUrl';
import { getWorkspaceSetting, updateWorkspaceSetting } from '../../vsCodeConfig/settings';

export async function runPreDeployTask(context: IDeployContext, deployFsPath: string, scmType: string | undefined): Promise<void> {
    const preDeployTask: string | undefined = getWorkspaceSetting(preDeployTaskSetting, deployFsPath);
    if (preDeployTask && preDeployTask.startsWith('func:')) {
        const message: string = localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to run preDeployTask "{0}".', preDeployTask);
        if (!await validateFuncCoreToolsInstalled(context, message, context.workspaceFolder.uri.fsPath)) {
            throw new UserCancelledError('validateFuncCoreToolsInstalled');
        }
    }

    let result: IPreDeployTaskResult = await tryRunPreDeployTask(context, deployFsPath, scmType);

    // https://github.com/Microsoft/vscode-azurefunctions/issues/826
    if (result.taskName === packTaskName && result.exitCode === 4) {
        result = await promptToBuildNativeDeps(context, deployFsPath, scmType);
    }

    if (result.failedToFindTask) {
        throw new Error(localize('noPreDeployTaskError', 'Failed to find preDeploy task "{0}". Modify the setting "{1}.{2}" or add that task to {3}.', result.taskName, ext.prefix, preDeployTaskSetting, tasksFileName));
    } else if (result.exitCode !== undefined && result.exitCode !== 0) {
        await handleFailedPreDeployTask(context, result);
    }
}

async function promptToBuildNativeDeps(context: IDeployContext, deployFsPath: string, scmType: string | undefined): Promise<IPreDeployTaskResult> {
    const message: string = localize('funcPackFailed', 'Failed to package your project. Use a Docker container to build incompatible dependencies?');
    const result: vscode.MessageItem | undefined = await vscode.window.showErrorMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.learnMore);
    if (result === DialogResponses.yes) {
        context.telemetry.properties.preDeployTaskResponse = 'packNativeDeps';
        await updateWorkspaceSetting(preDeployTaskSetting, `${packTaskName} ${buildNativeDeps}`, deployFsPath);
        return await tryRunPreDeployTask(context, deployFsPath, scmType);
    } else if (result === DialogResponses.learnMore) {
        context.telemetry.properties.preDeployTaskResponse = 'packLearnMore';
        await openUrl('https://aka.ms/func-python-publish');
        throw new UserCancelledError('funcPackFailed|learnMore');
    } else {
        context.telemetry.properties.preDeployTaskResponse = 'cancel';
        throw new UserCancelledError('funcPackFailed');
    }
}
