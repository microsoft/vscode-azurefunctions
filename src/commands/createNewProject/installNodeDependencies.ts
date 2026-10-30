/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { cpUtils } from '../../utils/cpUtils';

export async function installNodeDependencies(context: IActionContext, projectPath: string): Promise<void> {
    try {
        await cpUtils.executeCommand(ext.outputChannel, projectPath, 'npm', composeArgs(withArg('install'))());
        context.telemetry.properties.npmInstallSucceeded ??= 'true';
    } catch {
        context.telemetry.properties.npmInstallSucceeded = 'false';
        ext.outputChannel.appendLog(localize('npmInstallFailure', 'WARNING: Failed to install packages in your workspace. Run "npm install" manually instead.'));
    }
}
