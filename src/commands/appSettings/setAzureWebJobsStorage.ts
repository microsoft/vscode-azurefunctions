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

export async function setAzureWebJobsStorage(this: IActionContext): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select your local settings file.');
    const localSettingsFile: string = await getLocalSettingsFile(message);
    const wizard: AzureWizard<IAzureWebJobsStorageWizardContext> = new AzureWizard({ projectPath: path.dirname(localSettingsFile) }, {
        promptSteps: [new AzureWebJobsStoragePromptStep()],
        executeSteps: [new AzureWebJobsStorageExecuteStep()]
    });
    await wizard.prompt(this);
    await wizard.execute(this);
}
