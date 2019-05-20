/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { promptForProjectRuntime } from '../../vsCodeConfig/settings';
import { IProjectWizardContext } from './IProjectWizardContext';

export class ProjectRuntimeStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public async prompt(context: IProjectWizardContext): Promise<void> {
        context.runtime = await promptForProjectRuntime();
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return context.runtime === undefined;
    }
}
