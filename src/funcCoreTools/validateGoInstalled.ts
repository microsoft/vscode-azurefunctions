/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, DialogResponses, type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import { type MessageItem } from 'vscode';
import { cpUtils } from '../utils/cpUtils';
import { localize } from '../localize';
import { openUrl } from '../utils/openUrl';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

const goCommand: string = 'go';
const goInstallUrl: string = 'https://go.dev/dl/';

/**
 * Verifies that the Go toolchain is available on PATH before packaging a Go
 * Functions project for deployment. If missing, prompts the user with a
 * "Learn more" button that opens the Go install docs.
 *
 * Honors the `azureFunctions.validateGo` workspace setting (default true).
 *
 * @returns true if Go is installed (or validation is disabled), false otherwise.
 */
export async function validateGoInstalled(_context: IActionContext, workspacePath?: string): Promise<boolean> {
    let installed: boolean = false;

    await callWithTelemetryAndErrorHandling('azureFunctions.validateGoInstalled', async (innerContext: IActionContext) => {
        innerContext.errorHandling.suppressDisplay = true;

        if (getWorkspaceSetting<boolean>('validateGo', workspacePath) === false) {
            innerContext.telemetry.properties.validateGo = 'false';
            installed = true;
            return;
        }

        if (await goInstalled(workspacePath)) {
            installed = true;
            return;
        }

        const message: string = localize('installGoForDeploy', 'The Go toolchain is required to package Go Functions for deployment. Install Go and try again.');
        const result: MessageItem = await innerContext.ui.showWarningMessage(message, { modal: true, stepName: 'goNotInstalled' }, DialogResponses.learnMore);
        innerContext.telemetry.properties.dialogResult = result.title;
        if (result === DialogResponses.learnMore) {
            await openUrl(goInstallUrl);
        }
    });

    return installed;
}

async function goInstalled(workspacePath: string | undefined): Promise<boolean> {
    try {
        const result = await cpUtils.tryExecuteCommand(undefined, workspacePath, goCommand, composeArgs(withArg('version'))());
        return result.code === 0;
    } catch {
        return false;
    }
}
