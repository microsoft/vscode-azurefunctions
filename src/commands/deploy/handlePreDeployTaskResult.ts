/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as vscode from 'vscode';
import { handleFailedPreDeployTask, IPreDeployTaskResult, tryRunPreDeployTask } from 'vscode-azureappservice';
import { DialogResponses, IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { dotnetPublishTaskLabel, extensionPrefix, extInstallTaskName, javaPackageTaskLabel, packTaskName, preDeployTaskSetting, ProjectLanguage, ProjectRuntime } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { openUrl } from '../../utils/openUrl';
import { updateWorkspaceSetting } from '../../vsCodeConfig/settings';

export async function handlePreDeployTaskResult(actionContext: IActionContext, deployFsPath: string, scmType: string | undefined, result: IPreDeployTaskResult, language: ProjectLanguage, runtime: ProjectRuntime): Promise<void> {
    // https://github.com/Microsoft/vscode-azurefunctions/issues/826
    if (result.taskName === packTaskName && result.exitCode === 4) {
        result = await promptToBuildNativeDeps(actionContext, deployFsPath, scmType);
    }

    const messageLines: string[] = [];
    if (!result.taskName) {
        const recommendedTaskName: string | undefined = getRecommendedTaskName(language, runtime);
        if (recommendedTaskName) {
            messageLines.push(localize('noPreDeployTaskWarning', 'WARNING: Did not find recommended preDeploy task "{0}". The deployment will continue, but the selected folder may not reflect your latest changes.', recommendedTaskName));
            messageLines.push(localize('howToAddPreDeploy', 'In order to ensure that you always deploy your latest changes, add a preDeploy task with the following steps:'));
            const fullMessage: string = getFullPreDeployMessage(messageLines);
            ext.outputChannel.show(true);
            ext.outputChannel.appendLine(fullMessage);
        }
    } else if (result.failedToFindTask) {
        messageLines.push(localize('noPreDeployTaskError', 'Did not find preDeploy task "{0}". Change the "{1}.{2}" setting, manually edit your task.json, or re-initialize your VS Code config with the following steps:', result.taskName, extensionPrefix, preDeployTaskSetting));
        const fullMessage: string = getFullPreDeployMessage(messageLines);
        throw new Error(fullMessage);
    } else if (result.exitCode !== undefined && result.exitCode !== 0) {
        await handleFailedPreDeployTask(actionContext, result);
    }
}

function getFullPreDeployMessage(messageLines: string[]): string {
    messageLines.push(localize('howToAddPreDeploy1', '1. Open Command Palette (View -> Command Palette...)'));
    messageLines.push(localize('howToAddPreDeploy2', '2. Search for "Azure Functions" and run command "Initialize Project for Use with VS Code"'));
    messageLines.push(localize('howToAddPreDeploy3', '3. Select "Yes" to overwrite your tasks.json file when prompted'));
    return messageLines.join(os.EOL);
}

function getRecommendedTaskName(language: ProjectLanguage, runtime: ProjectRuntime): string | undefined {
    switch (language) {
        case ProjectLanguage.CSharp:
        case ProjectLanguage.FSharp:
            return dotnetPublishTaskLabel;
        case ProjectLanguage.JavaScript:
            // "func extensions install" is only supported on v2
            return runtime === ProjectRuntime.v1 ? undefined : extInstallTaskName;
        case ProjectLanguage.Python:
            return packTaskName;
        case ProjectLanguage.Java:
            return javaPackageTaskLabel;
        default:
            return undefined; // preDeployTask not needed
    }
}

async function promptToBuildNativeDeps(actionContext: IActionContext, deployFsPath: string, scmType: string | undefined): Promise<IPreDeployTaskResult> {
    const message: string = localize('funcPackFailed', 'Failed to package your project. Use a Docker container to build incompatible dependencies?');
    const result: vscode.MessageItem | undefined = await vscode.window.showErrorMessage(message, { modal: true }, DialogResponses.yes, DialogResponses.learnMore);
    if (result === DialogResponses.yes) {
        actionContext.properties.preDeployTaskResponse = 'packNativeDeps';
        const flag: string = '--build-native-deps';
        await updateWorkspaceSetting(preDeployTaskSetting, `${packTaskName} ${flag}`, deployFsPath);
        return await tryRunPreDeployTask(actionContext, deployFsPath, scmType, extensionPrefix);
    } else if (result === DialogResponses.learnMore) {
        actionContext.properties.preDeployTaskResponse = 'packLearnMore';
        await openUrl('https://aka.ms/func-python-publish');
        throw new UserCancelledError();
    } else {
        actionContext.properties.preDeployTaskResponse = 'cancel';
        throw new UserCancelledError();
    }
}
