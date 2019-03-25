/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { promptForProjectRuntime } from '../../ProjectSettings';
import { IProjectWizardContext } from './IProjectWizardContext';

export class ProjectRuntimeStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public async prompt(wizardContext: IProjectWizardContext): Promise<void> {
        wizardContext.runtime = await promptForProjectRuntime();
    }

    public shouldPrompt(wizardContext: IProjectWizardContext): boolean {
        return wizardContext.runtime === undefined;
    }
}
