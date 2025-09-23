/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { validateFuncCoreToolsInstalled } from '../../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../../../localize';
import { type IPreDebugValidateContext } from '../IPreDebugValidateContext';

// This behaves like both prompt & execute step because we need to block
export class FuncCoreToolsPromptAndInstallStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const message: string = localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to debug your local functions.');
        const installed: boolean = await validateFuncCoreToolsInstalled(context, message, context.workspaceFolder.uri.fsPath);

        if (!installed) {
            throw new UserCancelledError('funcCoreToolsInstallStep');
        }
    }

    public shouldPrompt(context: T): boolean {
        return context.validateFuncCoreTools;
    }
}
