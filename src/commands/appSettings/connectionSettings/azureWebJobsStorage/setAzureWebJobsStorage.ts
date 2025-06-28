/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { localize } from '../../../../localize';
import { getLocalSettingsFile } from '../../localSettings/getLocalSettingsFile';
import { type ISetConnectionSettingContext } from '../ISetConnectionSettingContext';
import { AzureWebJobsStoragePromptStep } from './AzureWebJobsStoragePromptStep';
import { AzureWebJobsStorageSetSettingStep } from './AzureWebJobsStorageSetSettingStep';
import { type IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export async function setAzureWebJobsStorage(context: Omit<ISetConnectionSettingContext, 'projectPath'>): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select your local settings file.');
    const localSettingsFile: string = await getLocalSettingsFile(context, message);
    // Todo: Add code action debug?
    const wizardContext: IAzureWebJobsStorageWizardContext = Object.assign(context, { projectPath: path.dirname(localSettingsFile) });
    const wizard: AzureWizard<IAzureWebJobsStorageWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [new AzureWebJobsStoragePromptStep()],
        executeSteps: [new AzureWebJobsStorageSetSettingStep()]
    });
    await wizard.prompt();
    await wizard.execute();
}
