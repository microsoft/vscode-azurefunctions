/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { handleFailedPreDeployTask, IPreDeployTaskResult, tryRunPreDeployTask } from 'vscode-azureappservice';
import { DialogResponses, IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { extensionPrefix, packTaskName, preDeployTaskSetting, tasksFileName } from '../../constants';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../../localize';
import { openUrl } from '../../utils/openUrl';
import { getWorkspaceSetting, updateWorkspaceSetting } from '../../vsCodeConfig/settings';

export async function runPreDeployTask(context: IActionContext, deployFsPath: string, scmType: string | undefined): Promise<void> {
    const preDeployTask: string | undefined = getWorkspaceSetting(preDeployTaskSetting, deployFsPath);
    if (preDeployTask && preDeployTask.startsWith('func:')) {
        const message: string = localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to run preDeployTask "{0}".', preDeployTask);
        if (!await validateFuncCoreToolsInstalled(message)) {
            throw new UserCancelledError();
        }
    }

    let result: IPreDeployTaskResult = await tryRunPreDeployTask(context, deployFsPath, scmType, extensionPrefix);

    // https://github.com/Microsoft/vscode-azurefunctions/issues/826
    if (result.taskName === packTaskName && result.exitCode === 4) {
        result = await promptToBuildNativeDeps(context, deployFsPath, scmType);
    }

    if (result.failedToFindTask) {
        throw new Error(localize('noPreDeployTaskError', 'Failed to find preDeploy task "{0}". Modify the setting "{1}.{2}" or add that task to {3}.', result.taskName, extensionPrefix, preDeployTaskSetting, tasksFileName));
    } else if (result.exitCode !== undefined && result.exitCode !== 0) {
        await handleFailedPreDeployTask(context, result);
    }
}

async function promptToBuildNativeDeps(context: IActionContext, deployFsPath: string, scmType: string | undefined): Promise<IPreDeployTaskResult> {
    const message: string = localize('funcPackFailed', 'Failed to package your project. Use a Docker container to build incompatible dependencies?');
    const result: vscode.MessageItem | undefined = await vscode.window.showErrorMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.learnMore);
    if (result === DialogResponses.yes) {
        context.properties.preDeployTaskResponse = 'packNativeDeps';
        const flag: string = '--build-native-deps';
        await updateWorkspaceSetting(preDeployTaskSetting, `${packTaskName} ${flag}`, deployFsPath);
        return await tryRunPreDeployTask(context, deployFsPath, scmType, extensionPrefix);
    } else if (result === DialogResponses.learnMore) {
        context.properties.preDeployTaskResponse = 'packLearnMore';
        await openUrl('https://aka.ms/func-python-publish');
        throw new UserCancelledError();
    } else {
        context.properties.preDeployTaskResponse = 'cancel';
        throw new UserCancelledError();
    }
}
