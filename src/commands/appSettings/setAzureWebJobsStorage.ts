/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { AzureWizard, IActionContext } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { AzureWebJobsStorageExecuteStep } from './AzureWebJobsStorageExecuteStep';
import { AzureWebJobsStoragePromptStep } from './AzureWebJobsStoragePromptStep';
import { getLocalSettingsFile } from './getLocalSettingsFile';
import { IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export async function setAzureWebJobsStorage(context: IActionContext): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select your local settings file.');
    const localSettingsFile: string = await getLocalSettingsFile(message);
    const wizardContext: IAzureWebJobsStorageWizardContext = Object.assign(context, { projectPath: path.dirname(localSettingsFile) });
    const wizard: AzureWizard<IAzureWebJobsStorageWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [new AzureWebJobsStoragePromptStep()],
        executeSteps: [new AzureWebJobsStorageExecuteStep()]
    });
    await wizard.prompt();
    await wizard.execute();
}
