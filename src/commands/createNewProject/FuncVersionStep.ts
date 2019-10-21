/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { promptForFuncVersion } from '../../FuncVersion';
import { IProjectWizardContext } from './IProjectWizardContext';

export class FuncVersionStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public async prompt(context: IProjectWizardContext): Promise<void> {
        context.version = await promptForFuncVersion();
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return context.version === undefined;
    }
}
