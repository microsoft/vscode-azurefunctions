/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, DialogResponses, type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import { type MessageItem } from 'vscode';
import { cpUtils } from '../utils/cpUtils';
import { openUrl } from '../utils/openUrl';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

const dlvCommand: string = 'dlv';
const dlvInstallUrl: string = 'https://github.com/go-delve/delve/tree/master/Documentation/installation';

/**
 * Verifies that Delve (`dlv`) is available on PATH before starting a Go debug
 * session. If missing, prompts the user with a "Learn more" button that opens
 * the Delve install docs.
 *
 * Honors the `azureFunctions.validateDelve` workspace setting (default true).
 *
 * @returns true if Delve is installed (or validation is disabled), false otherwise.
 */
export async function validateDelveInstalled(_context: IActionContext, message: string, workspacePath?: string): Promise<boolean> {
    let installed: boolean = false;

    await callWithTelemetryAndErrorHandling('azureFunctions.validateDelveInstalled', async (innerContext: IActionContext) => {
        innerContext.errorHandling.suppressDisplay = true;

        if (getWorkspaceSetting<boolean>('validateDelve', workspacePath) === false) {
            innerContext.telemetry.properties.validateDelve = 'false';
            installed = true;
            return;
        }

        if (await delveInstalled(workspacePath)) {
            installed = true;
            return;
        }

        const result: MessageItem = await innerContext.ui.showWarningMessage(message, { modal: true, stepName: 'delveNotInstalled' }, DialogResponses.learnMore);
        innerContext.telemetry.properties.dialogResult = result.title;
        if (result === DialogResponses.learnMore) {
            await openUrl(dlvInstallUrl);
        }
    });

    return installed;
}

async function delveInstalled(workspacePath: string | undefined): Promise<boolean> {
    try {
        // Delve uses `dlv version` (no leading dashes), unlike most CLIs.
        const result = await cpUtils.tryExecuteCommand(undefined, workspacePath, dlvCommand, composeArgs(withArg('version'))());
        return result.code === 0;
    } catch {
        return false;
    }
}
