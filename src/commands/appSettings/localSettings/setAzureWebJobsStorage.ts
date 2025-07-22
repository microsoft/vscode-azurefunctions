/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { CodeAction, ConnectionKey, localSettingsFileName } from '../../../constants';
import { localize } from '../../../localize';
import { createActivityContext } from '../../../utils/activityUtils';
import { type IStorageConnectionWizardContext } from '../connectionSettings/azureWebJobsStorage/IStorageConnectionWizardContext';
import { availableStorageConnections, StorageConnectionListStep } from '../connectionSettings/azureWebJobsStorage/StorageConnectionListStep';
import { getLocalSettingsFile } from './getLocalSettingsFile';

export async function setAzureWebJobsStorage(context: IActionContext): Promise<void> {
    const message: string = localize('selectLocalSettings', 'Select your local settings file.');
    const localSettingsFile: string = await getLocalSettingsFile(context, message);

    const wizardContext: IStorageConnectionWizardContext = {
        ...context,
        ...await createActivityContext(),
        // Setting to debug will prioritize writing to local settings file
        action: CodeAction.Debug,
        projectPath: path.dirname(localSettingsFile),
        newStorageConnectionSettingKey: ConnectionKey.Storage,
    };

    const wizard: AzureWizard<IStorageConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('settingStorageTitle', 'Setting "{0}" in "{1}"', ConnectionKey.Storage, localSettingsFileName),
        promptSteps: [new StorageConnectionListStep(availableStorageConnections)],
    });

    await wizard.prompt();
    await wizard.execute();
}
