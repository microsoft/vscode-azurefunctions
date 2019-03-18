/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import { validatePackageName } from "../../../utils/javaNameUtils";
import { IJavaFunctionWizardContext } from './IJavaFunctionWizardContext';

export class JavaPackageNameStep extends AzureWizardPromptStep<IJavaFunctionWizardContext> {
    public async prompt(wizardContext: IJavaFunctionWizardContext): Promise<void> {
        wizardContext.packageName = await ext.ui.showInputBox({
            placeHolder: localize('packagePlaceHolder', 'Package'),
            prompt: localize('packagePrompt', 'Provide a package name'),
            validateInput: validatePackageName,
            value: 'com.function'
        });
    }

    public shouldPrompt(wizardContext: IJavaFunctionWizardContext): boolean {
        return !wizardContext.packageName;
    }
}
