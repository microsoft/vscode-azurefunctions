/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { type IStorageAzureConnectionWizard } from '../IAzureWebJobsStorageWizardContext';
import { getStorageConnectionString } from '../getStorageConnectionString';

export class StorageAccountGetConnectionStep<T extends IStorageAzureConnectionWizard> extends AzureWizardExecuteStep<T> {
    public priority: number = 230;

    public async execute(context: T): Promise<void> {
        context.newStorageConnectionSettingValue = (await getStorageConnectionString(context)).connectionString;
    }

    public shouldExecute(context: T): boolean {
        return !!context.storageAccount;
    }
}
