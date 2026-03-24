/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activitySuccessContext, activitySuccessIcon, AzureWizardPromptStep, createContextValue, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { getLocalFuncCoreToolsVersion } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { lastCoreToolsInstallCommand } from '../../funcCoreTools/installFuncCoreTools';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../../localize';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

/**
 * This step handles both prompting and installation.
 * It preserves legacy behavior where we check & install func core
 * tools as a preflight task before proceeding. If installation is
 * declined, we throw to cancel the wizard since debugging can't
 * proceed without the CLI and the user has settings indicating we
 * should validate the tool.
 */
export class FuncCoreToolsInstallPromptStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    public async configureBeforePrompt(context: T): Promise<void> {
        try {
            // Check if the user has a custom func CLI path in settings set.  If it's set, we trust it automatically and don't need to validate it further.
            context.funcCoreToolsVersion ??= await getLocalFuncCoreToolsVersion(context, context.workspaceFolder.uri.fsPath);
        } catch { /** Do nothing */ }
    }

    public async prompt(context: T): Promise<void> {
        const message: string = localize('installFuncTools', 'You must have Azure Functions Core Tools installed to debug your local functions project.');
        const installed: boolean = await validateFuncCoreToolsInstalled(context, message, context.workspaceFolder.uri.fsPath);

        if (!installed) {
            throw new UserCancelledError('funcCoreToolsInstallStep');
        }

        context.activityChildren?.push(
            new ActivityChildItem({
                label: localize('installCoreTools', 'Install Azure Functions Core Tools'),
                description: lastCoreToolsInstallCommand.join(' '),
                contextValue: createContextValue(['funcCoreToolsPromptStepAndInstallItem', activitySuccessContext]),
                activityType: ActivityChildType.Success,
                iconPath: activitySuccessIcon,
                stepId: this.id,
            })
        );
    }

    public shouldPrompt(context: T): boolean {
        return context.validateFuncCoreTools && !context.funcCoreToolsVersion;
    }
}
