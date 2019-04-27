/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, IStorageAccountWizardContext } from 'vscode-azureextensionui';
import { localEmulatorConnectionString } from '../../constants';
import { azureWebJobsStorageKey, setLocalAppSetting } from '../../funcConfig/local.settings';
import { getStorageConnectionString } from '../../utils/azure';
import { IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export class AzureWebJobsStorageExecuteStep<T extends IAzureWebJobsStorageWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 230;

    public async execute(wizardContext: IAzureWebJobsStorageWizardContext): Promise<void> {
        let value: string;
        wizardContext.actionContext.properties.azureWebJobsStorageType = wizardContext.azureWebJobsStorageType;
        if (wizardContext.azureWebJobsStorageType === 'emulator') {
            value = localEmulatorConnectionString;
        } else {
            value = (await getStorageConnectionString(<IStorageAccountWizardContext>wizardContext)).connectionString;
        }

        await setLocalAppSetting(wizardContext.projectPath, azureWebJobsStorageKey, value, true /* suppressPrompt */);
    }

    public shouldExecute(wizardContext: IAzureWebJobsStorageWizardContext): boolean {
        return !!wizardContext.azureWebJobsStorageType;
    }
}
