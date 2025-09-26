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
 * @remarks
 */
export class FuncCoreToolsPromptAndInstallStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    public async configureBeforePrompt(context: T): Promise<void> {
        try {
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
                description: lastCoreToolsInstallCommand[0] /** The package manager alias */,
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
