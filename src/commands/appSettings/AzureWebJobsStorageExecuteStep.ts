/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageAccountWizardContext } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { localEmulatorConnectionString } from '../../constants';
import { azureWebJobsStorageKey, MismatchBehavior, setLocalAppSetting } from '../../funcConfig/local.settings';
import { getStorageConnectionString } from '../../utils/azure';
import { IAzureWebJobsStorageWizardContext } from './IAzureWebJobsStorageWizardContext';

export class AzureWebJobsStorageExecuteStep<T extends IAzureWebJobsStorageWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 230;

    public async execute(context: IAzureWebJobsStorageWizardContext): Promise<void> {
        let value: string;
        if (context.azureWebJobsStorageType === 'emulator') {
            value = localEmulatorConnectionString;
        } else {
            value = (await getStorageConnectionString(<IStorageAccountWizardContext>context)).connectionString;
        }

        await setLocalAppSetting(context, context.projectPath, azureWebJobsStorageKey, value, MismatchBehavior.Overwrite);
    }

    public shouldExecute(context: IAzureWebJobsStorageWizardContext): boolean {
        return !!context.azureWebJobsStorageType;
    }
}
