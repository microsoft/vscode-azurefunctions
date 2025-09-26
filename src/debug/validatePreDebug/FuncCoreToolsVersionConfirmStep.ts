/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import { type MessageItem } from 'vscode';
import { getLocalFuncCoreToolsVersion } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { isPythonV2Plus } from '../../utils/programmingModelUtils';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

export class FuncCoreToolsVersionConfirmStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        // Ensure that that Python V2+ projects have an appropriate version of Functions Core Tools installed.
        if (isPythonV2Plus(context.projectLanguage, context.projectLanguageModel)) {
            context.funcCoreToolsVersion ??= await getLocalFuncCoreToolsVersion(context, context.workspaceFolder.uri.fsPath);

            // NOTE: This is the latest version available as of this commit,
            //       but not necessarily the final "preview release" version.
            //       The Functions team is ok with using this version as the
            //       minimum bar.
            const expectedVersionRange = '>=4.0.4742';

            if (context.funcCoreToolsVersion && !semver.satisfies(context.funcCoreToolsVersion, expectedVersionRange)) {
                const message: string = localize('invalidFunctionVersion', 'The version of installed Functions tools "{0}" is not sufficient for this project type ("{1}").', context.funcCoreToolsVersion, expectedVersionRange);
                const debugAnyway: MessageItem = { title: localize('debugWithInvalidFunctionVersionAnyway', 'Debug anyway') };

                const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true, stepName: 'failedWithInvalidFunctionVersion' }, debugAnyway);
                if (result !== debugAnyway) {
                    throw new UserCancelledError('funcCoreToolsVersionConfirmStep');
                }
            }
        }
    }

    public shouldPrompt(context: T): boolean {
        return context.validateFuncCoreTools;
    }
}
